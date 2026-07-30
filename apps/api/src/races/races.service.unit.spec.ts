import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { MAX_PARTICIPANTS } from "@carrera/shared";
import { RacesService } from "./races.service";
import type { PrismaService } from "../prisma/prisma.service";

/**
 * Pure unit tests — Prisma & JWT mocked.
 * Covers create/join/start/finish/ranking counters and negative paths.
 */

type ParticipantRow = {
  id: string;
  raceId: string;
  clientId: string;
  nickname: string;
  isHost: boolean;
  status: string;
  color: string | null;
  startLat: number | null;
  startLng: number | null;
  finishedAt: Date | null;
  durationMs: number | null;
  joinedAt: Date;
};

type RaceRow = {
  id: string;
  code: string;
  status: string;
  joinMode: string;
  pinHash: string | null;
  destLat: number;
  destLng: number;
  destLabel: string | null;
  hostClientId: string;
  startedAt: Date | null;
  finishedAt: Date | null;
  finishRadiusM: number;
  createdAt: Date;
  participants: ParticipantRow[];
};

function makeHost(raceId: string, clientId = "11111111-1111-4111-8111-111111111111"): ParticipantRow {
  return {
    id: "host-p",
    raceId,
    clientId,
    nickname: "Host",
    isHost: true,
    status: "ACTIVE",
    color: "#e11d48",
    startLat: null,
    startLng: null,
    finishedAt: null,
    durationMs: null,
    joinedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function makeRace(overrides: Partial<RaceRow> = {}): RaceRow {
  const id = overrides.id ?? "race-1";
  const hostClientId =
    overrides.hostClientId ?? "11111111-1111-4111-8111-111111111111";
  const host = makeHost(id, hostClientId);
  const { participants: participantOverride, ...rest } = overrides;
  return {
    id,
    code: "ABCDEF",
    status: "LOBBY",
    joinMode: "OPEN",
    pinHash: null,
    destLat: 40.4,
    destLng: -3.7,
    destLabel: "Sol",
    hostClientId,
    startedAt: null,
    finishedAt: null,
    finishRadiusM: 80,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    ...rest,
    participants: participantOverride ?? [host],
  };
}

function createPrismaMock() {
  return {
    race: {
      findUnique: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    participant: {
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    positionSample: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    raceResult: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
}

describe("RacesService (unit)", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let jwt: JwtService;
  let service: RacesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    jwt = new JwtService({ secret: "test-secret", signOptions: { expiresIn: "1h" } });
    service = new RacesService(prisma as unknown as PrismaService, jwt);
  });

  describe("create", () => {
    it("positive: creates race with host ACTIVE and issues wsToken", async () => {
      // Arrange
      prisma.race.findUnique.mockResolvedValue(null);
      const race = makeRace();
      prisma.race.create.mockResolvedValue(race);

      // Act
      const result = await service.create({
        nickname: "Host",
        clientId: race.hostClientId,
        destLat: 40.4,
        destLng: -3.7,
        destLabel: "Sol",
        joinMode: "OPEN",
      });

      // Assert
      expect(result.race.code).toHaveLength(6);
      expect(result.participant.isHost).toBe(true);
      expect(result.participant.status).toBe("ACTIVE");
      expect(result.wsToken).toBeTruthy();
      expect(jwt.verify(result.wsToken)).toMatchObject({
        raceId: race.id,
        isHost: true,
      });
    });

    it("positive: trims nickname to 32 chars", async () => {
      prisma.race.findUnique.mockResolvedValue(null);
      const longNick = "X".repeat(50);
      prisma.race.create.mockImplementation(async ({ data }: { data: { participants: { create: { nickname: string } } } }) => {
        const race = makeRace();
        race.participants[0].nickname = data.participants.create.nickname;
        return race;
      });

      await service.create({
        nickname: longNick,
        clientId: "11111111-1111-4111-8111-111111111111",
        destLat: 1,
        destLng: 1,
        joinMode: "OPEN",
      });

      const createArg = prisma.race.create.mock.calls[0][0];
      expect(createArg.data.participants.create.nickname).toHaveLength(32);
    });
  });

  describe("getByCode", () => {
    it("negative: invalid code shape → NotFound (no DB query leak)", async () => {
      await expect(service.getByCode("';1")).rejects.toBeInstanceOf(NotFoundException);
      await expect(service.getByCode("ABCDE1")).rejects.toBeInstanceOf(NotFoundException); // 1 not in alphabet
      expect(prisma.race.findUnique).not.toHaveBeenCalled();
    });

    it("negative: unknown valid code → NotFound", async () => {
      prisma.race.findUnique.mockResolvedValue(null);
      await expect(service.getByCode("ABCDEF")).rejects.toBeInstanceOf(NotFoundException);
    });

    it("positive: returns public race + hasPin flag", async () => {
      const race = makeRace({ pinHash: "hashed" });
      prisma.race.findUnique.mockResolvedValue({ ...race, result: null });
      const out = await service.getByCode("abcdef");
      expect(out.race.code).toBe("ABCDEF");
      expect(out.hasPin).toBe(true);
      expect(out.participants).toHaveLength(1);
    });
  });

  describe("join", () => {
    it("negative: race not found", async () => {
      prisma.race.findUnique.mockResolvedValue(null);
      await expect(
        service.join("ABCDEF", {
          nickname: "G",
          clientId: "22222222-2222-4222-8222-222222222222",
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("negative: join after start (RACING) rejected", async () => {
      prisma.race.findUnique.mockResolvedValue(makeRace({ status: "RACING" }));
      await expect(
        service.join("ABCDEF", {
          nickname: "G",
          clientId: "22222222-2222-4222-8222-222222222222",
        }),
      ).rejects.toThrow(/ya empezó|terminó/);
    });

    it("negative: wrong PIN → Forbidden", async () => {
      // bcrypt hash of "1234"
      const pinHash =
        "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";
      prisma.race.findUnique.mockResolvedValue(makeRace({ pinHash }));
      // Force bcrypt fail by using a hash that won't match "0000"
      await expect(
        service.join("ABCDEF", {
          nickname: "G",
          clientId: "22222222-2222-4222-8222-222222222222",
          pin: "0000",
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("positive: OPEN join creates ACTIVE participant", async () => {
      const race = makeRace();
      prisma.race.findUnique.mockResolvedValue(race);
      const guest: ParticipantRow = {
        id: "guest-p",
        raceId: race.id,
        clientId: "22222222-2222-4222-8222-222222222222",
        nickname: "Guest",
        isHost: false,
        status: "ACTIVE",
        color: "#2563eb",
        startLat: null,
        startLng: null,
        finishedAt: null,
        durationMs: null,
        joinedAt: new Date(),
      };
      prisma.participant.create.mockResolvedValue(guest);

      const out = await service.join("ABCDEF", {
        nickname: "Guest",
        clientId: guest.clientId,
      });

      expect(out.participant.status).toBe("ACTIVE");
      expect(out.participant.isHost).toBe(false);
      expect(out.wsToken).toBeTruthy();
    });

    it("positive: APPROVAL join creates PENDING", async () => {
      const race = makeRace({ joinMode: "APPROVAL" });
      prisma.race.findUnique.mockResolvedValue(race);
      prisma.participant.create.mockResolvedValue({
        ...makeHost(race.id, "22222222-2222-4222-8222-222222222222"),
        id: "pending-p",
        isHost: false,
        status: "PENDING",
        nickname: "Wait",
      });

      const out = await service.join("ABCDEF", {
        nickname: "Wait",
        clientId: "22222222-2222-4222-8222-222222222222",
      });
      expect(out.participant.status).toBe("PENDING");
    });

    it("positive: rejoin same clientId returns existing (idempotent)", async () => {
      const race = makeRace();
      prisma.race.findUnique.mockResolvedValue(race);

      const out = await service.join("ABCDEF", {
        nickname: "Host-again",
        clientId: race.hostClientId,
      });

      expect(out.participant.id).toBe("host-p");
      expect(prisma.participant.create).not.toHaveBeenCalled();
    });

    it("negative: REJECTED client cannot rejoin", async () => {
      const host = makeHost("race-1");
      const rejected: ParticipantRow = {
        ...host,
        id: "rej",
        clientId: "33333333-3333-4333-8333-333333333333",
        isHost: false,
        status: "REJECTED",
        nickname: "Nope",
      };
      prisma.race.findUnique.mockResolvedValue(
        makeRace({ participants: [host, rejected] }),
      );

      await expect(
        service.join("ABCDEF", {
          nickname: "Nope",
          clientId: rejected.clientId,
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("counter: sala llena at MAX_PARTICIPANTS", async () => {
      const host = makeHost("race-1");
      const filled: ParticipantRow[] = [host];
      for (let i = 1; i < MAX_PARTICIPANTS; i++) {
        filled.push({
          ...host,
          id: `p-${i}`,
          clientId: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
          isHost: false,
          status: i % 2 === 0 ? "ACTIVE" : "PENDING",
          nickname: `P${i}`,
        });
      }
      expect(filled).toHaveLength(MAX_PARTICIPANTS);
      prisma.race.findUnique.mockResolvedValue(
        makeRace({ participants: filled }),
      );

      await expect(
        service.join("ABCDEF", {
          nickname: "Overflow",
          clientId: "99999999-9999-4999-8999-999999999999",
        }),
      ).rejects.toThrow(/Sala llena/);
      expect(prisma.participant.create).not.toHaveBeenCalled();
    });
  });

  describe("start", () => {
    it("positive: host moves LOBBY → COUNTDOWN", async () => {
      const race = makeRace();
      prisma.race.findUnique.mockResolvedValue(race);
      prisma.race.findUniqueOrThrow.mockResolvedValue(race);
      prisma.race.update.mockResolvedValue({ ...race, status: "COUNTDOWN" });

      const out = await service.start(race.id, race.hostClientId);
      expect(out.status).toBe("COUNTDOWN");
    });

    it("negative: non-host cannot start", async () => {
      prisma.race.findUnique.mockResolvedValue(makeRace());
      await expect(
        service.start("race-1", "22222222-2222-4222-8222-222222222222"),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("negative: cannot start if already RACING", async () => {
      const race = makeRace({ status: "RACING" });
      prisma.race.findUnique.mockResolvedValue(race);
      prisma.race.findUniqueOrThrow.mockResolvedValue(race);
      await expect(service.start(race.id, race.hostClientId)).rejects.toThrow(
        /no está en lobby/,
      );
    });
  });

  describe("finishParticipant", () => {
    it("positive: durationMs = finishedAt − startedAt (ms epoch)", async () => {
      const startedAt = new Date("2026-07-30T15:00:00.000Z");
      const finishedAt = new Date("2026-07-30T15:05:30.500Z");
      prisma.race.findUniqueOrThrow.mockResolvedValue(
        makeRace({ status: "RACING", startedAt }),
      );
      prisma.participant.count.mockResolvedValue(0); // first place
      prisma.participant.update.mockResolvedValue({
        id: "p1",
        status: "FINISHED",
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
      });

      const out = await service.finishParticipant("race-1", "p1", finishedAt);

      expect(out.place).toBe(1);
      expect(out.durationMs).toBe(5 * 60_000 + 30_000 + 500);
      expect(prisma.participant.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "FINISHED",
            durationMs: out.durationMs,
          }),
        }),
      );
    });

    it("counter: place = finishedCount + 1", async () => {
      const startedAt = new Date("2026-07-30T12:00:00Z");
      prisma.race.findUniqueOrThrow.mockResolvedValue(
        makeRace({ status: "RACING", startedAt }),
      );
      prisma.participant.count.mockResolvedValue(2); // two already finished
      prisma.participant.update.mockResolvedValue({ id: "p3" });

      const out = await service.finishParticipant(
        "race-1",
        "p3",
        new Date(startedAt.getTime() + 90_000),
      );
      expect(out.place).toBe(3);
      expect(out.durationMs).toBe(90_000);
    });

    it("negative: finish before startedAt set", async () => {
      prisma.race.findUniqueOrThrow.mockResolvedValue(
        makeRace({ startedAt: null }),
      );
      await expect(
        service.finishParticipant("race-1", "p1", new Date()),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("tryCompleteRace", () => {
    it("negative: returns null if not everyone finished and not force", async () => {
      const host = makeHost("race-1");
      const guest: ParticipantRow = {
        ...host,
        id: "g1",
        clientId: "22222222-2222-4222-8222-222222222222",
        isHost: false,
        status: "ACTIVE",
      };
      prisma.race.findUniqueOrThrow.mockResolvedValue(
        makeRace({
          status: "RACING",
          startedAt: new Date(),
          participants: [host, guest],
        }),
      );

      const payload = await service.tryCompleteRace("race-1", false);
      expect(payload).toBeNull();
    });

    it("positive: ranks by durationMs ascending when all finished", async () => {
      const startedAt = new Date("2026-07-30T10:00:00Z");
      const fast: ParticipantRow = {
        ...makeHost("race-1"),
        id: "fast",
        status: "FINISHED",
        durationMs: 60_000,
        finishedAt: new Date(startedAt.getTime() + 60_000),
      };
      const slow: ParticipantRow = {
        ...makeHost("race-1", "22222222-2222-4222-8222-222222222222"),
        id: "slow",
        isHost: false,
        status: "FINISHED",
        durationMs: 120_000,
        finishedAt: new Date(startedAt.getTime() + 120_000),
        nickname: "Slow",
      };
      prisma.race.findUniqueOrThrow.mockResolvedValue(
        makeRace({
          status: "RACING",
          startedAt,
          participants: [slow, fast], // unsorted input
        }),
      );
      prisma.positionSample.findMany.mockResolvedValue([]);
      prisma.raceResult.upsert.mockResolvedValue({});
      prisma.race.update.mockResolvedValue({});

      const payload = await service.tryCompleteRace("race-1", false);

      expect(payload).not.toBeNull();
      expect(payload!.ranking).toHaveLength(2);
      expect(payload!.ranking[0]).toMatchObject({
        participantId: "fast",
        place: 1,
        durationMs: 60_000,
      });
      expect(payload!.ranking[1]).toMatchObject({
        participantId: "slow",
        place: 2,
        durationMs: 120_000,
      });
      // Counter: places are 1..n consecutive
      expect(payload!.ranking.map((r) => r.place)).toEqual([1, 2]);
    });

    it("positive: force completes with partial finishers", async () => {
      const host = {
        ...makeHost("race-1"),
        status: "FINISHED" as const,
        durationMs: 45_000,
        finishedAt: new Date(),
      };
      const stillRacing = {
        ...makeHost("race-1", "22222222-2222-4222-8222-222222222222"),
        id: "active",
        isHost: false,
        status: "ACTIVE" as const,
        nickname: "Still",
      };
      prisma.race.findUniqueOrThrow.mockResolvedValue(
        makeRace({
          status: "RACING",
          startedAt: new Date(),
          participants: [host, stillRacing],
        }),
      );
      prisma.positionSample.findMany.mockResolvedValue([]);
      prisma.raceResult.upsert.mockResolvedValue({});
      prisma.race.update.mockResolvedValue({});

      const payload = await service.tryCompleteRace("race-1", true);
      expect(payload!.ranking).toHaveLength(1);
      expect(payload!.ranking[0].participantId).toBe("host-p");
    });

    it("positive: already FINISHED returns existing payload", async () => {
      const existing = { ranking: [], segments: {}, dest: { lat: 1, lng: 2 } };
      prisma.race.findUniqueOrThrow.mockResolvedValue(
        makeRace({ status: "FINISHED" }),
      );
      prisma.raceResult.findUnique.mockResolvedValue({ payload: existing });

      const payload = await service.tryCompleteRace("race-1");
      expect(payload).toEqual(existing);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe("forceFinish / requireHostRace", () => {
    it("negative: non-host forceFinish → Forbidden", async () => {
      prisma.race.findUnique.mockResolvedValue(makeRace());
      await expect(
        service.forceFinish("race-1", "22222222-2222-4222-8222-222222222222"),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe("approve", () => {
    it("positive: host accepts PENDING → ACTIVE", async () => {
      const race = makeRace({ joinMode: "APPROVAL" });
      prisma.race.findUnique.mockResolvedValue(race);
      prisma.participant.findFirst.mockResolvedValue({
        id: "pend",
        raceId: race.id,
        status: "PENDING",
      });
      prisma.participant.update.mockResolvedValue({
        id: "pend",
        clientId: "22222222-2222-4222-8222-222222222222",
        nickname: "Wait",
        isHost: false,
        status: "ACTIVE",
        color: "#2563eb",
        startLat: null,
        startLng: null,
        finishedAt: null,
        durationMs: null,
      });

      const out = await service.approve(race.id, {
        clientId: race.hostClientId,
        participantId: "pend",
        accept: true,
      });
      expect(out.status).toBe("ACTIVE");
    });

    it("negative: approve outside lobby", async () => {
      prisma.race.findUnique.mockResolvedValue(makeRace({ status: "RACING" }));
      await expect(
        service.approve("race-1", {
          clientId: "11111111-1111-4111-8111-111111111111",
          participantId: "x",
          accept: true,
        }),
      ).rejects.toThrow(/lobby/i);
    });
  });

  describe("markRacing", () => {
    it("positive: sets RACING + startedAt", async () => {
      const updated = makeRace({ status: "RACING", startedAt: new Date() });
      prisma.race.update.mockResolvedValue(updated);
      const out = await service.markRacing("race-1");
      expect(out.status).toBe("RACING");
      expect(out.startedAt).toBeInstanceOf(Date);
      expect(prisma.race.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "RACING" }),
        }),
      );
    });
  });
});
