import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
  JoinMode,
  ParticipantStatus,
  RaceStatus,
} from "@prisma/client";
import * as bcrypt from "bcryptjs";
import {
  FINISH_RADIUS_M_DEFAULT,
  MAX_PARTICIPANTS,
  generateRaceCode,
  normalizeRaceCode,
  splitTrackIntoSegments,
  type RaceResultPayload,
  type WsTokenClaims,
} from "@carrera/shared";
import { PrismaService } from "../prisma/prisma.service";
import { ApproveDto, CreateRaceDto, JoinRaceDto } from "./dto";

const COLORS = [
  "#e11d48",
  "#2563eb",
  "#16a34a",
  "#ca8a04",
  "#9333ea",
  "#0891b2",
  "#ea580c",
  "#4f46e5",
];

@Injectable()
export class RacesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private issueToken(claims: WsTokenClaims): string {
    return this.jwt.sign(claims);
  }

  private async uniqueCode(): Promise<string> {
    for (let i = 0; i < 20; i++) {
      const code = generateRaceCode();
      const exists = await this.prisma.race.findUnique({ where: { code } });
      if (!exists) return code;
    }
    throw new BadRequestException("No se pudo generar código de sala");
  }

  async create(dto: CreateRaceDto) {
    const code = await this.uniqueCode();
    const pinHash = dto.pin ? await bcrypt.hash(dto.pin, 10) : null;
    const finishRadiusM = Number(process.env.FINISH_RADIUS_M ?? FINISH_RADIUS_M_DEFAULT);

    const race = await this.prisma.race.create({
      data: {
        code,
        joinMode: dto.joinMode as JoinMode,
        pinHash,
        destLat: dto.destLat,
        destLng: dto.destLng,
        destLabel: dto.destLabel ?? null,
        hostClientId: dto.clientId,
        finishRadiusM,
        participants: {
          create: {
            clientId: dto.clientId,
            nickname: dto.nickname.trim().slice(0, 32),
            isHost: true,
            status: ParticipantStatus.ACTIVE,
            color: COLORS[0],
          },
        },
      },
      include: { participants: true },
    });

    const host = race.participants[0];
    const wsToken = this.issueToken({
      raceId: race.id,
      participantId: host.id,
      clientId: host.clientId,
      isHost: true,
    });

    return {
      race: this.publicRace(race),
      participant: this.publicParticipant(host),
      wsToken,
    };
  }

  async getByCode(code: string) {
    const normalized = normalizeRaceCode(code);
    // Defense in depth: never pass weird strings into queries
    if (!/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(normalized)) {
      throw new NotFoundException("Carrera no encontrada");
    }
    const race = await this.prisma.race.findUnique({
      where: { code: normalized },
      include: {
        participants: {
          where: { status: { not: ParticipantStatus.REJECTED } },
          orderBy: { joinedAt: "asc" },
        },
        result: true,
      },
    });
    if (!race) throw new NotFoundException("Carrera no encontrada");
    return {
      race: this.publicRace(race),
      participants: race.participants.map((p) => this.publicParticipant(p)),
      hasPin: Boolean(race.pinHash),
      result: race.result?.payload ?? null,
    };
  }

  async join(code: string, dto: JoinRaceDto) {
    const race = await this.prisma.race.findUnique({
      where: { code: normalizeRaceCode(code) },
      include: { participants: true },
    });
    if (!race) throw new NotFoundException("Carrera no encontrada");
    if (race.status !== RaceStatus.LOBBY) {
      throw new BadRequestException("La carrera ya empezó o terminó");
    }

    if (race.pinHash) {
      if (!dto.pin || !(await bcrypt.compare(dto.pin, race.pinHash))) {
        throw new ForbiddenException("PIN incorrecto");
      }
    }

    const existing = race.participants.find((p) => p.clientId === dto.clientId);
    if (existing) {
      if (existing.status === ParticipantStatus.REJECTED) {
        throw new ForbiddenException("No puedes unirte a esta carrera");
      }
      const wsToken = this.issueToken({
        raceId: race.id,
        participantId: existing.id,
        clientId: existing.clientId,
        isHost: existing.isHost,
      });
      return {
        race: this.publicRace(race),
        participant: this.publicParticipant(existing),
        wsToken,
      };
    }

    const activeCount = race.participants.filter(
      (p) =>
        p.status === ParticipantStatus.ACTIVE ||
        p.status === ParticipantStatus.PENDING,
    ).length;
    if (activeCount >= MAX_PARTICIPANTS) {
      throw new BadRequestException("Sala llena");
    }

    const status =
      race.joinMode === JoinMode.APPROVAL
        ? ParticipantStatus.PENDING
        : ParticipantStatus.ACTIVE;

    const color = COLORS[activeCount % COLORS.length];
    const participant = await this.prisma.participant.create({
      data: {
        raceId: race.id,
        clientId: dto.clientId,
        nickname: dto.nickname.trim().slice(0, 32),
        isHost: false,
        status,
        color,
      },
    });

    const wsToken = this.issueToken({
      raceId: race.id,
      participantId: participant.id,
      clientId: participant.clientId,
      isHost: false,
    });

    return {
      race: this.publicRace(race),
      participant: this.publicParticipant(participant),
      wsToken,
    };
  }

  async approve(raceId: string, dto: ApproveDto) {
    const race = await this.requireHostRace(raceId, dto.clientId);
    if (race.status !== RaceStatus.LOBBY) {
      throw new BadRequestException("Solo en lobby");
    }
    const participant = await this.prisma.participant.findFirst({
      where: { id: dto.participantId, raceId },
    });
    if (!participant) throw new NotFoundException("Participante no encontrado");

    const updated = await this.prisma.participant.update({
      where: { id: participant.id },
      data: {
        status: dto.accept
          ? ParticipantStatus.ACTIVE
          : ParticipantStatus.REJECTED,
      },
    });
    return this.publicParticipant(updated);
  }

  async start(raceId: string, clientId: string) {
    await this.requireHostRace(raceId, clientId);
    const race = await this.prisma.race.findUniqueOrThrow({
      where: { id: raceId },
      include: { participants: true },
    });
    if (race.status !== RaceStatus.LOBBY) {
      throw new BadRequestException("La carrera no está en lobby");
    }
    const active = race.participants.filter(
      (p) => p.status === ParticipantStatus.ACTIVE,
    );
    if (active.length < 1) {
      throw new BadRequestException("No hay participantes activos");
    }

    const updated = await this.prisma.race.update({
      where: { id: raceId },
      data: { status: RaceStatus.COUNTDOWN },
      include: { participants: true },
    });
    return this.publicRace(updated);
  }

  async markRacing(raceId: string) {
    const startedAt = new Date();
    return this.prisma.race.update({
      where: { id: raceId },
      data: { status: RaceStatus.RACING, startedAt },
      include: { participants: true },
    });
  }

  async setStartPositions(
    raceId: string,
    positions: { participantId: string; lat: number; lng: number }[],
  ) {
    await Promise.all(
      positions.map((p) =>
        this.prisma.participant.updateMany({
          where: { id: p.participantId, raceId },
          data: { startLat: p.lat, startLng: p.lng },
        }),
      ),
    );
  }

  async finishParticipant(
    raceId: string,
    participantId: string,
    finishedAt: Date,
  ) {
    const race = await this.prisma.race.findUniqueOrThrow({
      where: { id: raceId },
    });
    if (!race.startedAt) throw new BadRequestException("Carrera no iniciada");

    const place =
      (await this.prisma.participant.count({
        where: {
          raceId,
          status: ParticipantStatus.FINISHED,
        },
      })) + 1;

    const durationMs = finishedAt.getTime() - race.startedAt.getTime();
    const updated = await this.prisma.participant.update({
      where: { id: participantId },
      data: {
        status: ParticipantStatus.FINISHED,
        finishedAt,
        durationMs,
      },
    });
    return { participant: updated, place, durationMs };
  }

  async tryCompleteRace(raceId: string, force = false) {
    const race = await this.prisma.race.findUniqueOrThrow({
      where: { id: raceId },
      include: { participants: true },
    });
    if (race.status === RaceStatus.FINISHED) {
      const existing = await this.prisma.raceResult.findUnique({
        where: { raceId },
      });
      return existing?.payload ?? null;
    }
    if (race.status !== RaceStatus.RACING && race.status !== RaceStatus.COUNTDOWN) {
      return null;
    }

    const relevant = race.participants.filter(
      (p) =>
        p.status === ParticipantStatus.ACTIVE ||
        p.status === ParticipantStatus.FINISHED,
    );
    const allDone =
      relevant.length > 0 &&
      relevant.every((p) => p.status === ParticipantStatus.FINISHED);

    if (!allDone && !force) return null;

    const finished = race.participants
      .filter((p) => p.status === ParticipantStatus.FINISHED && p.durationMs != null)
      .sort((a, b) => (a.durationMs ?? 0) - (b.durationMs ?? 0));

    const ranking = finished.map((p, i) => ({
      participantId: p.id,
      nickname: p.nickname,
      durationMs: p.durationMs ?? 0,
      place: i + 1,
    }));

    const samples = await this.prisma.positionSample.findMany({
      where: { raceId },
      orderBy: { recordedAt: "asc" },
    });

    const segments: RaceResultPayload["segments"] = {};
    for (const p of race.participants) {
      const pts = samples
        .filter((s) => s.participantId === p.id)
        .map((s) => ({
          lat: s.lat,
          lng: s.lng,
          recordedAt: s.recordedAt.getTime(),
        }));
      segments[p.id] = splitTrackIntoSegments(pts, 4);
    }

    const payload: RaceResultPayload = {
      ranking,
      segments,
      dest: {
        lat: race.destLat,
        lng: race.destLng,
        label: race.destLabel,
      },
    };

    await this.prisma.$transaction([
      this.prisma.race.update({
        where: { id: raceId },
        data: { status: RaceStatus.FINISHED, finishedAt: new Date() },
      }),
      this.prisma.raceResult.upsert({
        where: { raceId },
        create: { raceId, payload: payload as object },
        update: { payload: payload as object },
      }),
    ]);

    return payload;
  }

  async forceFinish(raceId: string, clientId: string) {
    await this.requireHostRace(raceId, clientId);
    return this.tryCompleteRace(raceId, true);
  }

  async addPositionSample(input: {
    raceId: string;
    participantId: string;
    lat: number;
    lng: number;
    accuracyM?: number;
    recordedAt: Date;
  }) {
    return this.prisma.positionSample.create({ data: input });
  }

  async getRaceFull(raceId: string) {
    return this.prisma.race.findUnique({
      where: { id: raceId },
      include: {
        participants: { orderBy: { joinedAt: "asc" } },
        result: true,
      },
    });
  }

  async markLeft(participantId: string) {
    return this.prisma.participant.updateMany({
      where: {
        id: participantId,
        status: {
          in: [ParticipantStatus.ACTIVE, ParticipantStatus.PENDING],
        },
      },
      data: { status: ParticipantStatus.LEFT },
    });
  }

  private async requireHostRace(raceId: string, clientId: string) {
    const race = await this.prisma.race.findUnique({ where: { id: raceId } });
    if (!race) throw new NotFoundException("Carrera no encontrada");
    if (race.hostClientId !== clientId) {
      throw new ForbiddenException("Solo el host puede hacer esto");
    }
    return race;
  }

  publicRace(race: {
    id: string;
    code: string;
    status: RaceStatus;
    joinMode: JoinMode;
    destLat: number;
    destLng: number;
    destLabel: string | null;
    hostClientId: string;
    startedAt: Date | null;
    finishedAt: Date | null;
    finishRadiusM: number;
    createdAt: Date;
  }) {
    return {
      id: race.id,
      code: race.code,
      status: race.status,
      joinMode: race.joinMode,
      destLat: race.destLat,
      destLng: race.destLng,
      destLabel: race.destLabel,
      hostClientId: race.hostClientId,
      startedAt: race.startedAt?.toISOString() ?? null,
      finishedAt: race.finishedAt?.toISOString() ?? null,
      finishRadiusM: race.finishRadiusM,
      createdAt: race.createdAt.toISOString(),
    };
  }

  publicParticipant(p: {
    id: string;
    clientId: string;
    nickname: string;
    isHost: boolean;
    status: ParticipantStatus;
    color: string | null;
    startLat: number | null;
    startLng: number | null;
    finishedAt: Date | null;
    durationMs: number | null;
  }) {
    return {
      id: p.id,
      clientId: p.clientId,
      nickname: p.nickname,
      isHost: p.isHost,
      status: p.status,
      color: p.color,
      startLat: p.startLat,
      startLng: p.startLng,
      finishedAt: p.finishedAt?.toISOString() ?? null,
      durationMs: p.durationMs,
    };
  }
}
