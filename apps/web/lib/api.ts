const base = "";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? body.error ?? message;
      if (Array.isArray(message)) message = message.join(", ");
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

export const api = {
  createRace: (body: {
    nickname: string;
    clientId: string;
    destLat: number;
    destLng: number;
    destLabel?: string;
    joinMode: "OPEN" | "APPROVAL";
    pin?: string;
  }) =>
    req<{
      race: RacePublic;
      participant: ParticipantPublic;
      wsToken: string;
    }>("/api/races", { method: "POST", body: JSON.stringify(body) }),

  getRace: (code: string) =>
    req<{
      race: RacePublic;
      participants: ParticipantPublic[];
      hasPin: boolean;
      result: unknown;
    }>(`/api/races/${code}`),

  joinRace: (
    code: string,
    body: { nickname: string; clientId: string; pin?: string },
  ) =>
    req<{
      race: RacePublic;
      participant: ParticipantPublic;
      wsToken: string;
    }>(`/api/races/${code}/join`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  startRace: (id: string, clientId: string) =>
    req(`/api/races/${id}/start`, {
      method: "POST",
      body: JSON.stringify({ clientId }),
    }),

  finishRace: (id: string, clientId: string) =>
    req(`/api/races/${id}/finish`, {
      method: "POST",
      body: JSON.stringify({ clientId }),
    }),

  approve: (
    id: string,
    body: { clientId: string; participantId: string; accept: boolean },
  ) =>
    req(`/api/races/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  geoSearch: (q: string) =>
    req<
      Array<{
        lat: number;
        lng: number;
        label: string;
        subtitle?: string;
        kind?: "place" | "address" | "street" | "city" | "other";
      }>
    >(`/api/geo/search?q=${encodeURIComponent(q)}`),

  geoReverse: (lat: number, lng: number) =>
    req<{
      lat: number;
      lng: number;
      label: string;
      subtitle?: string;
      kind?: "place" | "address" | "street" | "city" | "other";
    }>(`/api/geo/reverse?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}`),

  results: (code: string) =>
    req<{ race: RacePublic; result: RaceResultPayload | null; participants: ParticipantPublic[] }>(
      `/api/races/${code}/results`,
    ),
};

export interface RacePublic {
  id: string;
  code: string;
  status: string;
  joinMode: string;
  destLat: number;
  destLng: number;
  destLabel: string | null;
  hostClientId: string;
  startedAt: string | null;
  finishedAt: string | null;
  finishRadiusM: number;
  createdAt: string;
}

export interface ParticipantPublic {
  id: string;
  clientId: string;
  nickname: string;
  isHost: boolean;
  status: string;
  color: string | null;
  startLat: number | null;
  startLng: number | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface RaceResultPayload {
  ranking: Array<{
    participantId: string;
    nickname: string;
    durationMs: number;
    place: number;
  }>;
  segments: Record<
    string,
    Array<{
      index: number;
      fromPct: number;
      toPct: number;
      durationMs: number;
      distanceM: number;
    }>
  >;
  dest: { lat: number; lng: number; label?: string | null };
}
