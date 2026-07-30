"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  getClientId,
  getNickname,
  pushRecent,
  saveSession,
  setNickname,
} from "@/lib/storage";

export default function CreatePage() {
  const router = useRouter();
  const [nickname, setNick] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<
    Array<{ lat: number; lng: number; label: string }>
  >([]);
  const [dest, setDest] = useState<{
    lat: number;
    lng: number;
    label: string;
  } | null>(null);
  const [joinMode, setJoinMode] = useState<"OPEN" | "APPROVAL">("OPEN");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const clientId = useMemo(
    () => (typeof window !== "undefined" ? getClientId() : ""),
    [],
  );

  useEffect(() => {
    setNick(getNickname());
  }, []);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api
        .geoSearch(query.trim())
        .then(setResults)
        .catch(() => setResults([]));
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  async function useMyLocationAsDest() {
    setError("");
    if (!navigator.geolocation) {
      setError("Geolocalización no disponible");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setDest({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          label: "Mi ubicación actual (meta de prueba)",
        });
      },
      () => setError("No se pudo obtener tu ubicación"),
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!nickname.trim()) {
      setError("Pon un apodo");
      return;
    }
    if (!dest) {
      setError("Elige un destino");
      return;
    }
    if (pin && !/^\d{4}$/.test(pin)) {
      setError("El PIN debe ser 4 dígitos o vacío");
      return;
    }
    setLoading(true);
    try {
      setNickname(nickname.trim());
      const res = await api.createRace({
        nickname: nickname.trim(),
        clientId,
        destLat: dest.lat,
        destLng: dest.lng,
        destLabel: dest.label,
        joinMode,
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
        role: "host",
        nickname: nickname.trim(),
        at: new Date().toISOString(),
      });
      router.push(`/r/${res.race.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <p>
        <a href="/">← Inicio</a>
      </p>
      <h1>Crear carrera</h1>
      <p className="muted">
        Destino tipo Waze: cada uno sale desde donde está.
      </p>

      <form className="stack" onSubmit={onSubmit}>
        <div className="card stack">
          <label>
            Tu apodo
            <input
              value={nickname}
              onChange={(e) => setNick(e.target.value)}
              maxLength={32}
              placeholder="Alex"
              required
            />
          </label>

          <label>
            Buscar destino
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Calle, ciudad, sitio…"
            />
          </label>

          {results.length > 0 && (
            <ul className="list">
              {results.map((r) => (
                <li key={`${r.lat}-${r.lng}-${r.label}`}>
                  <button
                    type="button"
                    className="secondary"
                    style={{ width: "100%", textAlign: "left" }}
                    onClick={() => {
                      setDest(r);
                      setResults([]);
                      setQuery(r.label);
                    }}
                  >
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button type="button" className="secondary" onClick={useMyLocationAsDest}>
            Usar mi ubicación como meta (prueba)
          </button>

          {dest && (
            <p className="pill">
              Meta: <strong style={{ color: "var(--text)" }}>{dest.label}</strong>
            </p>
          )}

          <label>
            Entrada a la sala
            <select
              value={joinMode}
              onChange={(e) =>
                setJoinMode(e.target.value as "OPEN" | "APPROVAL")
              }
            >
              <option value="OPEN">Abierta con código</option>
              <option value="APPROVAL">Con mi aprobación</option>
            </select>
          </label>

          <label>
            PIN opcional (4 dígitos)
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              inputMode="numeric"
              maxLength={4}
              placeholder="····"
            />
          </label>
        </div>

        {error && <div className="error">{error}</div>}

        <button type="submit" disabled={loading}>
          {loading ? "Creando…" : "Crear sala"}
        </button>
      </form>
    </main>
  );
}
