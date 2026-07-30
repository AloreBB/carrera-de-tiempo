export type RaceStatus =
  | "LOBBY"
  | "COUNTDOWN"
  | "RACING"
  | "FINISHED"
  | "CANCELLED";

export type JoinMode = "OPEN" | "APPROVAL";

export type ParticipantStatus =
  | "PENDING"
  | "ACTIVE"
  | "REJECTED"
  | "LEFT"
  | "FINISHED";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PositionSamplePoint extends LatLng {
  recordedAt: number; // epoch ms
}

export interface SegmentStat {
  index: number;
  fromPct: number;
  toPct: number;
  durationMs: number;
  distanceM: number;
}

export interface RankingEntry {
  participantId: string;
  nickname: string;
  durationMs: number;
  place: number;
}

export interface RaceResultPayload {
  ranking: RankingEntry[];
  segments: Record<string, SegmentStat[]>;
  dest: LatLng & { label?: string | null };
}

export interface WsTokenClaims {
  raceId: string;
  participantId: string;
  clientId: string;
  isHost: boolean;
}

export const FINISH_RADIUS_M_DEFAULT = 80;
export const MAX_PARTICIPANTS = 20;
export const COUNTDOWN_MS = 3000;
export const POSITION_MIN_INTERVAL_MS = 1500;
export const POSITION_MIN_MOVE_M = 15;
export const POSITION_BATCH_MS = 1000;
export const DISCONNECT_GRACE_MS = 30_000;
export const SEGMENT_COUNT = 4;
