import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { RacesService } from "./races.service";
import { randomUUID } from "crypto";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("RacesService integration", () => {
  let service: RacesService;
  let prisma: PrismaService;

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
    await prisma.$disconnect();
  });

  it("creates, joins, starts race", async () => {
    const hostId = randomUUID();
    const guestId = randomUUID();

    const created = await service.create({
      nickname: "Host",
      clientId: hostId,
      destLat: 40.4168,
      destLng: -3.7038,
      destLabel: "Sol",
      joinMode: "OPEN",
    });

    expect(created.race.code).toHaveLength(6);
    expect(created.wsToken).toBeTruthy();

    const joined = await service.join(created.race.code, {
      nickname: "Guest",
      clientId: guestId,
    });
    expect(joined.participant.nickname).toBe("Guest");

    await service.start(created.race.id, hostId);
    const full = await service.getRaceFull(created.race.id);
    expect(full?.status).toBe("COUNTDOWN");
  });

  it("rejects wrong pin", async () => {
    const hostId = randomUUID();
    const created = await service.create({
      nickname: "Host",
      clientId: hostId,
      destLat: 40.4,
      destLng: -3.7,
      joinMode: "OPEN",
      pin: "1234",
    });

    await expect(
      service.join(created.race.code, {
        nickname: "X",
        clientId: randomUUID(),
        pin: "0000",
      }),
    ).rejects.toThrow();
  });
});
