"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RaceMap } from "@/components/RaceMap";
import {
  api,
  type ParticipantPublic,
  type RacePublic,
  type RaceResultPayload,
} from "@/lib/api";
import { getSocket, WS_EVENTS } from "@/lib/socket";
import {
  getClientId,
  getNickname,
  loadSession,
  pushRecent,
  saveSession,
  setNickname,
} from "@/lib/storage";

function formatMs(ms: number) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function RaceRoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const router = useRouter();
  const clientId = useMemo(
    () => (typeof window !== "undefined" ? getClientId() : ""),
    [],
  );

  const [phase, setPhase] = useState<"boot" | "join" | "room">("boot");
  const [nickname, setNick] = useState("");
  const [pin, setPin] = useState("");
  const [hasPin, setHasPin] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [race, setRace] = useState<RacePublic | null>(null);
  const [participants, setParticipants] = useState<ParticipantPublic[]>([]);
  const [wsToken, setWsToken] = useState<string | null>(null);
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [conn, setConn] = useState("connecting");
  const [countdownEnds, setCountdownEnds] = useState<number | null>(null);
  const [positions, setPositions] = useState<
    Record<string, { lat: number; lng: number; t: number }>
  >({});
  const [result, setResult] = useState<RaceResultPayload | null>(null);
  const [selfPos, setSelfPos] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const watchId = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const [tick, setTick] = useState(0);

  const isHost = race?.hostClientId === clientId;

  const bootstrap = useCallback(async () => {
    try {
      const data = await api.getRace(code);
      setRace(data.race);
      setParticipants(data.participants);
      setHasPin(data.hasPin);
      if (data.result) setResult(data.result as RaceResultPayload);

      if (data.race.status === "FINISHED") {
        setPhase("room");
        return;
      }

      const session = loadSession();
      if (session?.code === code && session.wsToken) {
        setWsToken(session.wsToken);
        setParticipantId(session.participantId);
        setPhase("room");
        return;
      }

      // re-join silently if this device already has a seat
      const mine = data.participants.find((p) => p.clientId === clientId);
      if (mine && data.race.status !== "FINISHED") {
        try {
          const res = await api.joinRace(code, {
            nickname: getNickname() || mine.nickname,
            clientId,
          });
          saveSession({
            raceId: res.race.id,
            code: res.race.code,
            wsToken: res.wsToken,
            participantId: res.participant.id,
          });
          setRace(res.race);
          setWsToken(res.wsToken);
          setParticipantId(res.participant.id);
          setPhase("room");
          return;
        } catch {
          setPhase("join");
          setNick(getNickname() || mine.nickname);
          return;
        }
      }
      setPhase("join");
      setNick(getNickname());
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se encontró la carrera");
      setPhase("join");
    }
  }, [code, clientId]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  async function doJoin(e?: React.FormEvent) {
    e?.preventDefault();
    setError("");
    if (!nickname.trim()) {
      setError("Pon un apodo");
      return;
    }
    setLoading(true);
    try {
      setNickname(nickname.trim());
      const res = await api.joinRace(code, {
        nickname: nickname.trim(),
        clientId,
        pin: pin || undefined,
      });
      saveSession({
        raceId: res.race.id,
        code: res.race.code,
        wsToken: res.wsToken,
        participantId: res.participant.id,
      });
      pushRecent({
        code: res.race.code,
        raceId: res.race.id,
        role: res.participant.isHost ? "host" : "player",
        nickname: nickname.trim(),
        at: new Date().toISOString(),
      });
      setRace(res.race);
      setWsToken(res.wsToken);
      setParticipantId(res.participant.id);
      setPhase("room");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo unir");
    } finally {
      setLoading(false);
    }
  }

  // Socket + GPS
  useEffect(() => {
    if (phase !== "room" || !wsToken || !race) return;

    const socket = getSocket(wsToken);
    setConn(socket.connected ? "live" : "connecting");

    const onConnect = () => setConn("live");
    const onDisconnect = () => setConn("reconnecting");
    const onState = (state: {
      race: RacePublic;
      participants: ParticipantPublic[];
      result: RaceResultPayload | null;
    }) => {
      setRace(state.race);
      setParticipants(state.participants);
      if (state.result) setResult(state.result);
      if (state.race.startedAt) {
        startedAtRef.current = new Date(state.race.startedAt).getTime();
      }
    };
    const onCountdown = ({ endsAt }: { endsAt: number }) => {
      setCountdownEnds(endsAt);
    };
    const onStarted = ({ startedAt }: { startedAt: string }) => {
      startedAtRef.current = new Date(startedAt).getTime();
      setCountdownEnds(null);
    };
    const onPositions = (
      map: Record<string, { lat: number; lng: number; t: number }>,
    ) => setPositions(map);
    const onCompleted = ({ results }: { results: RaceResultPayload }) => {
      setResult(results);
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on(WS_EVENTS.RACE_STATE, onState);
    socket.on(WS_EVENTS.RACE_COUNTDOWN, onCountdown);
    socket.on(WS_EVENTS.RACE_STARTED, onStarted);
    socket.on(WS_EVENTS.RACE_POSITIONS, onPositions);
    socket.on(WS_EVENTS.RACE_COMPLETED, onCompleted);

    if (navigator.geolocation) {
      watchId.current = navigator.geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          setSelfPos({ lat, lng });
          if (
            race.status === "RACING" ||
            race.status === "COUNTDOWN" ||
            race.status === "LOBBY"
          ) {
            socket.emit(WS_EVENTS.RACE_POSITION, {
              lat,
              lng,
              accuracy: pos.coords.accuracy,
              t: Date.now(),
            });
          }
        },
        () => setError("Activa la ubicación para competir"),
        { enableHighAccuracy: true, maximumAge: 1000 },
      );
    }

    const clock = setInterval(() => setTick((t) => t + 1), 1000);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off(WS_EVENTS.RACE_STATE, onState);
      socket.off(WS_EVENTS.RACE_COUNTDOWN, onCountdown);
      socket.off(WS_EVENTS.RACE_STARTED, onStarted);
      socket.off(WS_EVENTS.RACE_POSITIONS, onPositions);
      socket.off(WS_EVENTS.RACE_COMPLETED, onCompleted);
      if (watchId.current != null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
      clearInterval(clock);
    };
  }, [phase, wsToken, race?.id, race?.status]);

  async function startRace() {
    if (!race || !wsToken) return;
    setError("");
    const socket = getSocket(wsToken);
    socket.emit(WS_EVENTS.HOST_START, {}, (ack: { ok: boolean; error?: string }) => {
      if (ack && !ack.ok) setError(ack.error ?? "No se pudo empezar");
    });
    try {
      const updated = (await api.startRace(race.id, clientId)) as RacePublic;
      if (updated?.status) {
        setRace((r) => (r ? { ...r, ...updated } : updated));
        setCountdownEnds(Date.now() + 3000);
      }
    } catch (e) {
      // socket path may already have started; soft-fail only if still lobby
      if (race.status === "LOBBY") {
        setError(e instanceof Error ? e.message : "No se pudo empezar");
      }
    }
  }

  async function forceFinish() {
    if (!race) return;
    try {
      await api.finishRace(race.id, clientId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function approve(pid: string, accept: boolean) {
    if (!race || !wsToken) return;
    const socket = getSocket(wsToken);
    socket.emit(WS_EVENTS.HOST_APPROVE, { participantId: pid, accept });
    try {
      await api.approve(race.id, { clientId, participantId: pid, accept });
    } catch {
      /* ignore if socket handled */
    }
  }

  const mapPlayers = useMemo(() => {
    const list = participants
      .filter((p) => p.status === "ACTIVE" || p.status === "FINISHED")
      .map((p) => {
        const pos =
          p.id === participantId && selfPos
            ? selfPos
            : positions[p.id]
              ? { lat: positions[p.id].lat, lng: positions[p.id].lng }
              : null;
        if (!pos) return null;
        return {
          id: p.id,
          lat: pos.lat,
          lng: pos.lng,
          color: p.color ?? "#38bdf8",
          label: p.nickname,
          isSelf: p.id === participantId,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      lat: number;
      lng: number;
      color: string;
      label: string;
      isSelf: boolean;
    }>;
    return list;
  }, [participants, positions, selfPos, participantId]);

  const elapsed =
    startedAtRef.current && race?.status === "RACING"
      ? Date.now() - startedAtRef.current
      : 0;
  void tick;

  const countdownLeft = countdownEnds
    ? Math.max(0, Math.ceil((countdownEnds - Date.now()) / 1000))
    : null;

  if (phase === "boot") {
    return (
      <main>
        <p className="muted">Cargando sala…</p>
      </main>
    );
  }

  if (phase === "join" && race?.status !== "FINISHED") {
    return (
      <main>
        <p>
          <a href="/">← Inicio</a>
        </p>
        <h1>Sala {code}</h1>
        {race && (
          <p className="muted">
            Meta: {race.destLabel ?? `${race.destLat.toFixed(4)}, ${race.destLng.toFixed(4)}`}
          </p>
        )}
        <form className="stack" onSubmit={doJoin}>
          <div className="card stack">
            <label>
              Tu apodo
              <input
                value={nickname}
                onChange={(e) => setNick(e.target.value)}
                maxLength={32}
                required
              />
            </label>
            {hasPin && (
              <label>
                PIN
                <input
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  inputMode="numeric"
                  maxLength={4}
                  required
                />
              </label>
            )}
          </div>
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading}>
            {loading ? "Entrando…" : "Entrar a la sala"}
          </button>
        </form>
      </main>
    );
  }

  if (!race) {
    return (
      <main>
        <div className="error">{error || "Carrera no encontrada"}</div>
        <a href="/">Volver</a>
      </main>
    );
  }

  if (race.status === "FINISHED" || result) {
    const ranking = result?.ranking ?? [];
    return (
      <main>
        <p>
          <a href="/">← Inicio</a>
        </p>
        <h1>Resultados</h1>
        <p className="muted">Código {race.code}</p>
        <div className="card">
          <ol style={{ margin: 0, paddingLeft: "1.2rem" }}>
            {ranking.length === 0 && <p className="muted">Sin llegadas registradas.</p>}
            {ranking.map((r) => (
              <li key={r.participantId} style={{ marginBottom: "0.5rem" }}>
                <strong>
                  #{r.place} {r.nickname}
                </strong>{" "}
                · {formatMs(r.durationMs)}
              </li>
            ))}
          </ol>
        </div>
        {participantId && result?.segments[participantId] && (
          <div className="card">
            <h2 style={{ fontSize: "1rem" }}>Tus tramos</h2>
            <ul className="list">
              {result.segments[participantId].map((s) => (
                <li key={s.index}>
                  <span>
                    {s.fromPct.toFixed(0)}–{s.toPct.toFixed(0)}%
                  </span>
                  <span>{formatMs(s.durationMs)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <button className="secondary" onClick={() => router.push("/")}>
          Volver al inicio
        </button>
      </main>
    );
  }

  const pending = participants.filter((p) => p.status === "PENDING");
  const active = participants.filter(
    (p) => p.status === "ACTIVE" || p.status === "FINISHED",
  );

  return (
    <main>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <a href="/">←</a>
        <span className="pill">
          {conn === "live" ? "En vivo" : conn === "reconnecting" ? "Reconectando…" : "Conectando…"}
        </span>
      </div>

      <h1 style={{ fontSize: "1.25rem", marginTop: "0.5rem" }}>
        {race.status === "LOBBY"
          ? "Lobby"
          : race.status === "COUNTDOWN"
            ? "¡Preparados!"
            : "¡Carrera!"}
      </h1>

      {race.status === "LOBBY" && (
        <div className="card">
          <div className="code-big" data-testid="race-code">
            {race.code}
          </div>
          <div className="row" style={{ justifyContent: "center", marginTop: "0.5rem" }}>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                const url = `${window.location.origin}/r/${race.code}`;
                void navigator.clipboard?.writeText(url);
              }}
            >
              Copiar enlace
            </button>
          </div>
          <p className="muted" style={{ textAlign: "center" }}>
            Meta: {race.destLabel ?? "punto en el mapa"}
          </p>
        </div>
      )}

      {(race.status === "RACING" ||
        race.status === "COUNTDOWN" ||
        race.status === "LOBBY") && (
        <RaceMap
          dest={{ lat: race.destLat, lng: race.destLng }}
          players={mapPlayers}
        />
      )}

      {countdownLeft != null && countdownLeft > 0 && (
        <div className="card" style={{ textAlign: "center", fontSize: "2rem" }}>
          {countdownLeft}
        </div>
      )}

      {race.status === "RACING" && (
        <div className="card row" style={{ justifyContent: "space-between" }}>
          <span>Tiempo</span>
          <strong data-testid="elapsed">{formatMs(elapsed)}</strong>
        </div>
      )}

      <div className="card">
        <h2 style={{ fontSize: "1rem" }}>Pilotos</h2>
        <ul className="list">
          {active.map((p) => (
            <li key={p.id}>
              <span>
                <span
                  className="dot"
                  style={{ background: p.color ?? "#888", marginRight: 8 }}
                />
                {p.nickname}
                {p.isHost ? " · host" : ""}
                {p.status === "FINISHED" ? " · 🏁" : ""}
              </span>
              <span className="muted">
                {p.durationMs != null ? formatMs(p.durationMs) : p.status}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {isHost && race.joinMode === "APPROVAL" && pending.length > 0 && (
        <div className="card">
          <h2 style={{ fontSize: "1rem" }}>Pendientes</h2>
          {pending.map((p) => (
            <div key={p.id} className="row" style={{ marginBottom: 8 }}>
              <span>{p.nickname}</span>
              <button type="button" onClick={() => approve(p.id, true)}>
                OK
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => approve(p.id, false)}
              >
                No
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {isHost && race.status === "LOBBY" && (
        <button data-testid="start-race" onClick={startRace}>
          Empezar carrera
        </button>
      )}

      {isHost && race.status === "RACING" && (
        <button className="secondary" onClick={forceFinish}>
          Cerrar carrera
        </button>
      )}
    </main>
  );
}
