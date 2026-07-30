import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { RacesService } from "./races.service";
import { randomUUID } from "crypto";
import { MAX_PARTICIPANTS } from "@carrera/shared";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("RacesService integration", () => {
  let service: RacesService;
  let prisma: PrismaService;
  const createdRaceIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const jwt = new JwtService({
      secret: process.env.JWT_WS_SECRET ?? "test-secret",
      signOptions: { expiresIn: "1h" },
    });
    service = new RacesService(prisma, jwt);
  });

  afterAll(async () => {
    // Cleanup created races (cascade participants/samples/results if schema allows)
    for (const id of createdRaceIds) {
      try {
        await prisma.positionSample.deleteMany({ where: { raceId: id } });
        await prisma.raceResult.deleteMany({ where: { raceId: id } });
        await prisma.participant.deleteMany({ where: { raceId: id } });
        await prisma.race.deleteMany({ where: { id } });
      } catch {
        /* best-effort */
      }
    }
    await prisma.$disconnect();
  });

  async function createOpen(hostId = randomUUID(), pin?: string) {
    const created = await service.create({
      nickname: "Host",
      clientId: hostId,
      destLat: 40.4168,
      destLng: -3.7038,
      destLabel: "Sol",
      joinMode: "OPEN",
      pin,
    });
    createdRaceIds.push(created.race.id);
    return { ...created, hostId };
  }

  it("positive: creates, joins, starts race → COUNTDOWN", async () => {
    const hostId = randomUUID();
    const guestId = randomUUID();

    const created = await createOpen(hostId);
    expect(created.race.code).toHaveLength(6);
    expect(created.wsToken).toBeTruthy();

    const joined = await service.join(created.race.code, {
      nickname: "Guest",
      clientId: guestId,
    });
    expect(joined.participant.nickname).toBe("Guest");
    expect(joined.participant.status).toBe("ACTIVE");

    await service.start(created.race.id, hostId);
    const full = await service.getRaceFull(created.race.id);
    expect(full?.status).toBe("COUNTDOWN");
  });

  it("negative: rejects wrong pin", async () => {
    const hostId = randomUUID();
    const created = await createOpen(hostId, "1234");

    await expect(
      service.join(created.race.code, {
        nickname: "X",
        clientId: randomUUID(),
        pin: "0000",
      }),
    ).rejects.toThrow();
  });

  it("positive: correct pin allows join", async () => {
    const hostId = randomUUID();
    const created = await createOpen(hostId, "5678");
    const joined = await service.join(created.race.code, {
      nickname: "PinUser",
      clientId: randomUUID(),
      pin: "5678",
    });
    expect(joined.participant.status).toBe("ACTIVE");
  });

  it("negative: non-host cannot start", async () => {
    const hostId = randomUUID();
    const guestId = randomUUID();
    const created = await createOpen(hostId);
    await service.join(created.race.code, {
      nickname: "Guest",
      clientId: guestId,
    });
    await expect(service.start(created.race.id, guestId)).rejects.toThrow();
  });

  it("negative: cannot join after race started", async () => {
    const hostId = randomUUID();
    const created = await createOpen(hostId);
    await service.start(created.race.id, hostId);
    await expect(
      service.join(created.race.code, {
        nickname: "Late",
        clientId: randomUUID(),
      }),
    ).rejects.toThrow(/ya empezó|terminó/);
  });

  it("positive: finish duration + place counters + ranking", async () => {
    const hostId = randomUUID();
    const guestId = randomUUID();
    const created = await createOpen(hostId);
    const joined = await service.join(created.race.code, {
      nickname: "Guest",
      clientId: guestId,
    });

    await service.start(created.race.id, hostId);
    await service.markRacing(created.race.id);

    const race = await service.getRaceFull(created.race.id);
    expect(race?.startedAt).toBeTruthy();
    const t0 = race!.startedAt!.getTime();

    // Guest finishes first (faster)
    const guestFinish = new Date(t0 + 30_000);
    const f1 = await service.finishParticipant(
      created.race.id,
      joined.participant.id,
      guestFinish,
    );
    expect(f1.place).toBe(1);
    expect(f1.durationMs).toBe(30_000);

    // Host finishes second
    const hostFinish = new Date(t0 + 90_000);
    const f2 = await service.finishParticipant(
      created.race.id,
      created.participant.id,
      hostFinish,
    );
    expect(f2.place).toBe(2);
    expect(f2.durationMs).toBe(90_000);

    const payload = await service.tryCompleteRace(created.race.id);
    expect(payload).not.toBeNull();
    expect(payload!.ranking).toHaveLength(2);
    expect(payload!.ranking[0].durationMs).toBe(30_000);
    expect(payload!.ranking[0].place).toBe(1);
    expect(payload!.ranking[1].durationMs).toBe(90_000);
    expect(payload!.ranking[1].place).toBe(2);

    // Counter: places consecutive
    expect(payload!.ranking.map((r) => r.place)).toEqual([1, 2]);

    const done = await service.getRaceFull(created.race.id);
    expect(done?.status).toBe("FINISHED");
  });

  it("positive: forceFinish by host with one still racing", async () => {
    const hostId = randomUUID();
    const guestId = randomUUID();
    const created = await createOpen(hostId);
    const joined = await service.join(created.race.code, {
      nickname: "Guest",
      clientId: guestId,
    });
    await service.start(created.race.id, hostId);
    await service.markRacing(created.race.id);
    const race = await service.getRaceFull(created.race.id);
    const t0 = race!.startedAt!.getTime();

    await service.finishParticipant(
      created.race.id,
      joined.participant.id,
      new Date(t0 + 10_000),
    );

    const payload = await service.forceFinish(created.race.id, hostId);
    expect(payload).not.toBeNull();
    expect(payload!.ranking).toHaveLength(1);
    expect(payload!.ranking[0].participantId).toBe(joined.participant.id);
  });

  it("positive: APPROVAL join stays PENDING until accept", async () => {
    const hostId = randomUUID();
    const guestId = randomUUID();
    const created = await service.create({
      nickname: "Host",
      clientId: hostId,
      destLat: 4.7,
      destLng: -74.0,
      joinMode: "APPROVAL",
    });
    createdRaceIds.push(created.race.id);

    const joined = await service.join(created.race.code, {
      nickname: "Waiter",
      clientId: guestId,
    });
    expect(joined.participant.status).toBe("PENDING");

    const accepted = await service.approve(created.race.id, {
      clientId: hostId,
      participantId: joined.participant.id,
      accept: true,
    });
    expect(accepted.status).toBe("ACTIVE");
  });

  it("negative: getByCode rejects invalid codes", async () => {
    await expect(service.getByCode("bad")).rejects.toThrow();
    await expect(service.getByCode("ABCDE1")).rejects.toThrow();
  });

  it("counter: room rejects join at MAX_PARTICIPANTS", async () => {
    const hostId = randomUUID();
    const created = await createOpen(hostId);
    // host already counts as 1
    for (let i = 1; i < MAX_PARTICIPANTS; i++) {
      await service.join(created.race.code, {
        nickname: `P${i}`,
        clientId: randomUUID(),
      });
    }
    await expect(
      service.join(created.race.code, {
        nickname: "Overflow",
        clientId: randomUUID(),
      }),
    ).rejects.toThrow(/Sala llena/);
  }, 60_000);
});
