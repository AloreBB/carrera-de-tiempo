import { JwtService } from "@nestjs/jwt";
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import {
  COUNTDOWN_MS,
  DISCONNECT_GRACE_MS,
  POSITION_BATCH_MS,
  POSITION_MIN_INTERVAL_MS,
  WS_EVENTS,
  isWithinRadius,
  type RacePositionsMap,
  type WsTokenClaims,
} from "@carrera/shared";
import { ParticipantStatus, RaceStatus } from "@prisma/client";
import { Server, Socket } from "socket.io";
import { RacesService } from "../races/races.service";

interface SocketData {
  claims: WsTokenClaims;
}

function wsCorsOrigin(): string | string[] | boolean {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw) {
    // Deny open CORS on sockets in production; allow loose only in local
    return process.env.NODE_ENV === "production" ? false : true;
  }
  return raw.split(",").map((o) => o.trim()).filter(Boolean);
}

@WebSocketGateway({
  cors: {
    origin: wsCorsOrigin(),
    credentials: true,
  },
  // Prefer websocket; polling still ok behind reverse proxies
  transports: ["websocket", "polling"],
  // Limit max payload size (bytes) — bots flooding large frames get dropped
  maxHttpBufferSize: 16 * 1024,
  // connection state recovery off (stateless rooms)
  connectTimeout: 10_000,
})
export class RaceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private lastPositionAt = new Map<string, number>();
  private lastPersistedAt = new Map<string, number>();
  private livePositions = new Map<string, RacePositionsMap>();
  private batchTimers = new Map<string, NodeJS.Timeout>();
  private disconnectTimers = new Map<string, NodeJS.Timeout>();
  private countdownTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private readonly jwt: JwtService,
    private readonly races: RacesService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.wsToken as string | undefined) ??
        (client.handshake.headers["x-ws-token"] as string | undefined);
      if (!token) {
        client.emit(WS_EVENTS.RACE_ERROR, {
          code: "AUTH",
          message: "Falta wsToken",
        });
        client.disconnect(true);
        return;
      }
      const claims = this.jwt.verify<WsTokenClaims>(token);
      (client.data as SocketData).claims = claims;
      await client.join(this.room(claims.raceId));

      const existing = this.disconnectTimers.get(claims.participantId);
      if (existing) {
        clearTimeout(existing);
        this.disconnectTimers.delete(claims.participantId);
      }

      await this.emitState(claims.raceId);
    } catch {
      client.emit(WS_EVENTS.RACE_ERROR, {
        code: "AUTH",
        message: "Token inválido",
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    const claims = (client.data as SocketData)?.claims;
    if (!claims) return;
    const timer = setTimeout(async () => {
      await this.races.markLeft(claims.participantId);
      await this.emitState(claims.raceId);
      this.disconnectTimers.delete(claims.participantId);
    }, DISCONNECT_GRACE_MS);
    this.disconnectTimers.set(claims.participantId, timer);
  }

  @SubscribeMessage(WS_EVENTS.HOST_START)
  async onHostStart(@ConnectedSocket() client: Socket) {
    const claims = this.requireClaims(client);
    if (!claims.isHost) {
      return { ok: false, error: "Solo el host" };
    }
    try {
      await this.races.start(claims.raceId, claims.clientId);
      const endsAt = Date.now() + COUNTDOWN_MS;
      this.server
        .to(this.room(claims.raceId))
        .emit(WS_EVENTS.RACE_COUNTDOWN, { endsAt });
      await this.emitState(claims.raceId);

      const prev = this.countdownTimers.get(claims.raceId);
      if (prev) clearTimeout(prev);

      const timer = setTimeout(async () => {
        const race = await this.races.markRacing(claims.raceId);
        this.server.to(this.room(claims.raceId)).emit(WS_EVENTS.RACE_STARTED, {
          startedAt: race.startedAt?.toISOString(),
        });
        await this.emitState(claims.raceId);
        this.ensureBatch(claims.raceId);
        this.countdownTimers.delete(claims.raceId);
      }, COUNTDOWN_MS);
      this.countdownTimers.set(claims.raceId, timer);

      return { ok: true };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error al empezar";
      return { ok: false, error: message };
    }
  }

  @SubscribeMessage(WS_EVENTS.HOST_APPROVE)
  async onHostApprove(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { participantId: string; accept: boolean },
  ) {
    const claims = this.requireClaims(client);
    if (!claims.isHost) return { ok: false, error: "Solo el host" };
    try {
      const participant = await this.races.approve(claims.raceId, {
        clientId: claims.clientId,
        participantId: body.participantId,
        accept: body.accept,
      });
      this.server
        .to(this.room(claims.raceId))
        .emit(WS_EVENTS.RACE_PARTICIPANT, participant);
      await this.emitState(claims.raceId);
      return { ok: true, participant };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error";
      return { ok: false, error: message };
    }
  }

  @SubscribeMessage(WS_EVENTS.HOST_FINISH)
  async onHostFinish(@ConnectedSocket() client: Socket) {
    const claims = this.requireClaims(client);
    if (!claims.isHost) return { ok: false, error: "Solo el host" };
    try {
      const results = await this.races.forceFinish(
        claims.raceId,
        claims.clientId,
      );
      this.server
        .to(this.room(claims.raceId))
        .emit(WS_EVENTS.RACE_COMPLETED, { results });
      await this.emitState(claims.raceId);
      this.clearRaceRuntime(claims.raceId);
      return { ok: true, results };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error";
      return { ok: false, error: message };
    }
  }

  @SubscribeMessage(WS_EVENTS.RACE_POSITION)
  async onPosition(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    body: { lat: number; lng: number; accuracy?: number; t?: number },
  ) {
    const claims = this.requireClaims(client);
    const now = Date.now();
    const last = this.lastPositionAt.get(claims.participantId) ?? 0;
    if (now - last < POSITION_MIN_INTERVAL_MS) {
      return { ok: true, throttled: true };
    }
    this.lastPositionAt.set(claims.participantId, now);

    if (
      typeof body.lat !== "number" ||
      typeof body.lng !== "number" ||
      Number.isNaN(body.lat) ||
      Number.isNaN(body.lng)
    ) {
      return { ok: false, error: "coords inválidas" };
    }

    const map = this.livePositions.get(claims.raceId) ?? {};
    map[claims.participantId] = {
      lat: body.lat,
      lng: body.lng,
      t: body.t ?? now,
    };
    this.livePositions.set(claims.raceId, map);
    this.ensureBatch(claims.raceId);

    const race = await this.races.getRaceFull(claims.raceId);
    if (!race || race.status !== RaceStatus.RACING) {
      return { ok: true };
    }

    const participant = race.participants.find(
      (p) => p.id === claims.participantId,
    );
    if (!participant || participant.status !== ParticipantStatus.ACTIVE) {
      return { ok: true };
    }

    // persist samples ~ every 4s
    const lastP = this.lastPersistedAt.get(claims.participantId) ?? 0;
    if (now - lastP >= 4000) {
      this.lastPersistedAt.set(claims.participantId, now);
      await this.races.addPositionSample({
        raceId: claims.raceId,
        participantId: claims.participantId,
        lat: body.lat,
        lng: body.lng,
        accuracyM: body.accuracy,
        recordedAt: new Date(body.t ?? now),
      });
    }

    if (
      isWithinRadius(
        { lat: body.lat, lng: body.lng },
        { lat: race.destLat, lng: race.destLng },
        race.finishRadiusM,
      )
    ) {
      const finishedAt = new Date();
      const { place, durationMs } = await this.races.finishParticipant(
        claims.raceId,
        claims.participantId,
        finishedAt,
      );
      this.server.to(this.room(claims.raceId)).emit(WS_EVENTS.RACE_FINISHED_ONE, {
        participantId: claims.participantId,
        place,
        durationMs,
      });
      await this.emitState(claims.raceId);

      const results = await this.races.tryCompleteRace(claims.raceId, false);
      if (results) {
        this.server
          .to(this.room(claims.raceId))
          .emit(WS_EVENTS.RACE_COMPLETED, { results });
        await this.emitState(claims.raceId);
        this.clearRaceRuntime(claims.raceId);
      }
    }

    return { ok: true };
  }

  private ensureBatch(raceId: string) {
    if (this.batchTimers.has(raceId)) return;
    const timer = setInterval(() => {
      const positions = this.livePositions.get(raceId);
      if (positions && Object.keys(positions).length > 0) {
        this.server
          .to(this.room(raceId))
          .emit(WS_EVENTS.RACE_POSITIONS, positions);
      }
    }, POSITION_BATCH_MS);
    this.batchTimers.set(raceId, timer);
  }

  private clearRaceRuntime(raceId: string) {
    const t = this.batchTimers.get(raceId);
    if (t) clearInterval(t);
    this.batchTimers.delete(raceId);
    this.livePositions.delete(raceId);
    const c = this.countdownTimers.get(raceId);
    if (c) clearTimeout(c);
    this.countdownTimers.delete(raceId);
  }

  private async emitState(raceId: string) {
    const full = await this.races.getRaceFull(raceId);
    if (!full) return;
    const state = {
      race: this.races.publicRace(full),
      participants: full.participants.map((p) =>
        this.races.publicParticipant(p),
      ),
      result: full.result?.payload ?? null,
    };
    this.server.to(this.room(raceId)).emit(WS_EVENTS.RACE_STATE, state);
  }

  private room(raceId: string) {
    return `race:${raceId}`;
  }

  private requireClaims(client: Socket): WsTokenClaims {
    const claims = (client.data as SocketData)?.claims;
    if (!claims) throw new Error("No auth");
    return claims;
  }
}
