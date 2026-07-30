"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Copy,
  Flag,
  Home,
  KeyRound,
  Loader2,
  MapPin,
  Play,
  Radio,
  Share2,
  Timer,
  Trophy,
  User,
  Users,
  X,
} from "lucide-react";
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
  const [copied, setCopied] = useState(false);

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
      setError("Escribe un apodo");
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
      setError(err instanceof Error ? err.message : "No se pudo entrar");
    } finally {
      setLoading(false);
    }
  }

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
    socket.emit(
      WS_EVENTS.HOST_START,
      {},
      (ack: { ok: boolean; error?: string }) => {
        if (ack && !ack.ok) setError(ack.error ?? "No se pudo empezar");
      },
    );
    try {
      const updated = (await api.startRace(race.id, clientId)) as RacePublic;
      if (updated?.status) {
        setRace((r) => (r ? { ...r, ...updated } : updated));
        setCountdownEnds(Date.now() + 3000);
      }
    } catch (e) {
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
      setError(e instanceof Error ? e.message : "Error al cerrar");
    }
  }

  async function approve(pid: string, accept: boolean) {
    if (!race || !wsToken) return;
    const socket = getSocket(wsToken);
    socket.emit(WS_EVENTS.HOST_APPROVE, { participantId: pid, accept });
    try {
      await api.approve(race.id, { clientId, participantId: pid, accept });
    } catch {
      /* socket may handle */
    }
  }

  async function copyInvite() {
    if (!race) return;
    const url = `${window.location.origin}/r/${race.code}`;
    const text = `Únete a mi carrera: ${race.code}\n${url}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  const mapPlayers = useMemo(() => {
    return participants
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
          color: p.color ?? "#5ec8ff",
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
      <main className="app-shell">
        <p className="muted row">
          <Loader2 className="spin" size={16} /> Cargando sala…
        </p>
      </main>
    );
  }

  if (phase === "join" && race?.status !== "FINISHED") {
    return (
      <main className="app-shell">
        <Link href="/" className="back-link">
          <Home size={16} /> Inicio
        </Link>
        <p className="eyebrow">
          <Users size={12} /> Sala
        </p>
        <h1 className="display" style={{ letterSpacing: "0.14em" }}>
          {code}
        </h1>
        {race && (
          <p className="lead row" style={{ gap: 6 }}>
            <MapPin size={16} />
            {race.destLabel ?? "Destino en el mapa"}
          </p>
        )}
        <form className="stack" onSubmit={doJoin}>
          <div className="card stack">
            <label className="field">
              <span>Tu apodo</span>
              <div className="input-wrap">
                <User className="icon" size={18} />
                <input
                  value={nickname}
                  onChange={(e) => setNick(e.target.value)}
                  maxLength={32}
                  placeholder="Cómo te ven"
                  required
                />
              </div>
            </label>
            {hasPin && (
              <label className="field">
                <span>PIN de la sala</span>
                <div className="input-wrap">
                  <KeyRound className="icon" size={18} />
                  <input
                    value={pin}
                    onChange={(e) =>
                      setPin(e.target.value.replace(/\D/g, ""))
                    }
                    inputMode="numeric"
                    maxLength={4}
                    required
                  />
                </div>
              </label>
            )}
          </div>
          {error && (
            <div className="error-box">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="spin" size={18} /> Entrando…
              </>
            ) : (
              "Entrar a la sala"
            )}
          </button>
        </form>
      </main>
    );
  }

  if (!race) {
    return (
      <main className="app-shell">
        <div className="error-box">
          <AlertCircle size={18} />
          <span>{error || "Carrera no encontrada"}</span>
        </div>
        <Link href="/" className="btn btn-secondary btn-block" style={{ marginTop: 12 }}>
          Volver
        </Link>
      </main>
    );
  }

  if (race.status === "FINISHED" || result) {
    const ranking = result?.ranking ?? [];
    return (
      <main className="app-shell">
        <Link href="/" className="back-link">
          <Home size={16} /> Inicio
        </Link>
        <div className="hero-mark" aria-hidden>
          <Trophy size={24} />
        </div>
        <h1 className="display">Resultados</h1>
        <p className="lead">
          Sala{" "}
          <strong style={{ letterSpacing: "0.12em" }} className="display">
            {race.code}
          </strong>
        </p>

        <div className="card">
          {ranking.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              Nadie llegó a meta en esta carrera.
            </p>
          ) : (
            <ul className="list-clean">
              {ranking.map((r) => (
                <li key={r.participantId}>
                  <span className="row">
                    <span
                      className="pill"
                      style={{
                        color: r.place === 1 ? "var(--amber)" : "var(--muted)",
                        minWidth: 42,
                        justifyContent: "center",
                      }}
                    >
                      #{r.place}
                    </span>
                    <strong>{r.nickname}</strong>
                  </span>
                  <span
                    className="display"
                    style={{ fontSize: "1.05rem", letterSpacing: "0.04em" }}
                  >
                    {formatMs(r.durationMs)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {participantId && result?.segments[participantId] && (
          <div className="card" style={{ marginTop: "0.85rem" }}>
            <h2 className="row" style={{ gap: 8 }}>
              <Timer size={16} color="var(--muted)" /> Tus tramos
            </h2>
            <ul className="list-clean">
              {result.segments[participantId].map((s) => (
                <li key={s.index}>
                  <span className="muted">
                    {s.fromPct.toFixed(0)}–{s.toPct.toFixed(0)}%
                  </span>
                  <strong className="display">{formatMs(s.durationMs)}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          className="btn btn-secondary btn-block"
          style={{ marginTop: "1rem" }}
          onClick={() => router.push("/")}
        >
          Volver al inicio
        </button>
      </main>
    );
  }

  const pending = participants.filter((p) => p.status === "PENDING");
  const active = participants.filter(
    (p) => p.status === "ACTIVE" || p.status === "FINISHED",
  );

  const title =
    race.status === "LOBBY"
      ? "Sala de espera"
      : race.status === "COUNTDOWN"
        ? "Preparados"
        : "En carrera";

  return (
    <main className="app-shell">
      <div className="row between">
        <Link href="/" className="back-link" style={{ marginBottom: 0 }}>
          <Home size={16} />
        </Link>
        <span
          className={`pill ${conn === "live" ? "live" : "warn"}`}
        >
          <Radio size={12} />
          {conn === "live"
            ? "En vivo"
            : conn === "reconnecting"
              ? "Reconectando…"
              : "Conectando…"}
        </span>
      </div>

      <h1 className="display" style={{ fontSize: "1.35rem", marginTop: "0.75rem" }}>
        {title}
      </h1>

      {race.status === "LOBBY" && (
        <div className="card" style={{ marginTop: "0.65rem" }}>
          <p className="eyebrow" style={{ justifyContent: "center", width: "100%" }}>
            Código de invitación
          </p>
          <div className="code-hero" data-testid="race-code">
            {race.code}
          </div>
          <div className="stack" style={{ marginTop: "0.85rem" }}>
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={copyInvite}
            >
              {copied ? <Check size={18} /> : <Share2 size={18} />}
              {copied ? "Copiado" : "Copiar código y enlace"}
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-block"
              onClick={() => {
                void navigator.clipboard?.writeText(race.code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              <Copy size={16} /> Solo el código
            </button>
          </div>
          <p
            className="muted row"
            style={{
              margin: "0.85rem 0 0",
              justifyContent: "center",
              textAlign: "center",
              fontSize: "0.86rem",
            }}
          >
            <MapPin size={14} />
            {race.destLabel ?? "Destino en el mapa"}
          </p>
        </div>
      )}

      <div style={{ marginTop: "0.85rem" }}>
        <RaceMap
          dest={{ lat: race.destLat, lng: race.destLng }}
          players={mapPlayers}
        />
      </div>

      {countdownLeft != null && countdownLeft > 0 && (
        <div className="card" style={{ marginTop: "0.85rem" }}>
          <div className="countdown-big">{countdownLeft}</div>
          <p className="muted" style={{ textAlign: "center", margin: 0 }}>
            La carrera empieza…
          </p>
        </div>
      )}

      {race.status === "RACING" && (
        <div className="card row between" style={{ marginTop: "0.85rem" }}>
          <span className="row muted">
            <Timer size={16} /> Tiempo
          </span>
          <strong
            className="display"
            data-testid="elapsed"
            style={{ fontSize: "1.35rem", letterSpacing: "0.06em" }}
          >
            {formatMs(elapsed)}
          </strong>
        </div>
      )}

      <div className="card" style={{ marginTop: "0.85rem" }}>
        <h2 className="row" style={{ gap: 8 }}>
          <Users size={16} color="var(--muted)" /> Pilotos
        </h2>
        <ul className="list-clean">
          {active.map((p) => (
            <li key={p.id}>
              <span className="row">
                <span
                  className="dot"
                  style={{ background: p.color ?? "#888" }}
                />
                <span>
                  {p.nickname}
                  {p.isHost ? (
                    <span className="muted"> · org</span>
                  ) : null}
                  {p.status === "FINISHED" ? (
                    <Flag
                      size={14}
                      color="var(--amber)"
                      style={{ marginLeft: 6, verticalAlign: -2 }}
                    />
                  ) : null}
                </span>
              </span>
              <span className="muted">
                {p.durationMs != null ? formatMs(p.durationMs) : "—"}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {isHost && race.joinMode === "APPROVAL" && pending.length > 0 && (
        <div className="card" style={{ marginTop: "0.85rem" }}>
          <h2>Pendientes</h2>
          {pending.map((p) => (
            <div key={p.id} className="row between" style={{ marginBottom: 8 }}>
              <span>{p.nickname}</span>
              <div className="row">
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ padding: "0.45rem 0.7rem" }}
                  onClick={() => approve(p.id, true)}
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  style={{ padding: "0.45rem 0.7rem" }}
                  onClick={() => approve(p.id, false)}
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="error-box" style={{ marginTop: "0.85rem" }}>
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      {isHost && race.status === "LOBBY" && (
        <button
          data-testid="start-race"
          className="btn btn-primary btn-block"
          style={{ marginTop: "1rem" }}
          onClick={startRace}
        >
          <Play size={18} fill="currentColor" />
          Empezar carrera
        </button>
      )}

      {isHost && race.status === "RACING" && (
        <button
          className="btn btn-secondary btn-block"
          style={{ marginTop: "1rem" }}
          onClick={forceFinish}
        >
          Cerrar carrera
        </button>
      )}
    </main>
  );
}
