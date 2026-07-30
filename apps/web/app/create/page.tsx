"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  ChevronDown,
  Crosshair,
  Loader2,
  MapPinned,
  User,
} from "lucide-react";
import {
  DestinationPickerMap,
  type MapPoint,
} from "@/components/DestinationPickerMap";
import { PlaceSearch, type PlaceResult } from "@/components/PlaceSearch";
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
  const [dest, setDest] = useState<PlaceResult | null>(null);
  const [joinMode, setJoinMode] = useState<"OPEN" | "APPROVAL">("OPEN");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [mapCenter, setMapCenter] = useState<MapPoint | null>(null);
  const reverseSeq = useRef(0);
  const clientId = useMemo(
    () => (typeof window !== "undefined" ? getClientId() : ""),
    [],
  );

  useEffect(() => {
    setNick(getNickname());
    // soft-center map on user if allowed
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setMapCenter({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        () => {
          /* keep default map */
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60_000 },
      );
    }
  }, []);

  async function applyMapPoint(point: MapPoint) {
    setError("");
    setResolving(true);
    const seq = ++reverseSeq.current;
    // optimistic pin
    setDest({
      lat: point.lat,
      lng: point.lng,
      label: `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
      subtitle: "Punto en el mapa",
      kind: "other",
    });
    setQuery(`${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`);
    try {
      const place = await api.geoReverse(point.lat, point.lng);
      if (seq !== reverseSeq.current) return;
      setDest({
        lat: place.lat,
        lng: place.lng,
        label: place.label,
        subtitle: place.subtitle,
        kind: place.kind,
      });
      setQuery(place.label);
    } catch {
      if (seq !== reverseSeq.current) return;
      // keep coordinate label
    } finally {
      if (seq === reverseSeq.current) setResolving(false);
    }
  }

  async function useMyLocationAsDest() {
    setError("");
    if (!navigator.geolocation) {
      setError("La ubicación no está disponible en este dispositivo");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const point = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setMapCenter(point);
        setLocating(false);
        await applyMapPoint(point);
      },
      () => {
        setError("Activa la ubicación o elige un destino en la búsqueda o el mapa");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000 },
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!nickname.trim()) {
      setError("Escribe un apodo para identificarte");
      return;
    }
    if (!dest) {
      setError("Elige un destino: búscalo o tócalo en el mapa");
      return;
    }
    if (pin && !/^\d{4}$/.test(pin)) {
      setError("El PIN, si lo usas, debe ser de 4 dígitos");
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
        destLabel: dest.subtitle
          ? `${dest.label} · ${dest.subtitle}`
          : dest.label,
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
      setError(err instanceof Error ? err.message : "No se pudo crear la sala");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} /> Inicio
      </Link>

      <h1 className="display">Nueva carrera</h1>
      <p className="lead">
        Busca una dirección o toca el mapa para fijar la meta. El código de
        invitación se genera solo.
      </p>

      <form className="stack" onSubmit={onSubmit}>
        <div className="card stack">
          <label className="field">
            <span>Tu apodo</span>
            <div className="input-wrap">
              <User className="icon" size={18} />
              <input
                value={nickname}
                onChange={(e) => setNick(e.target.value)}
                maxLength={32}
                placeholder="Cómo te ven los demás"
                required
              />
            </div>
          </label>

          <div className="field">
            <span>Buscar destino</span>
            <PlaceSearch
              value={query}
              onQueryChange={(q) => {
                setQuery(q);
                if (dest && q !== dest.label) setDest(null);
              }}
              onSelect={(place) => {
                setDest(place);
                setQuery(place.label);
              }}
            />
            <p className="muted" style={{ margin: "0.15rem 0 0", fontSize: "0.8rem" }}>
              Sugerencias de lugares y direcciones, o elige en el mapa abajo.
            </p>
          </div>

          <div className="field">
            <span>O elige en el mapa</span>
            <DestinationPickerMap
              value={
                dest ? { lat: dest.lat, lng: dest.lng } : null
              }
              defaultCenter={mapCenter ?? undefined}
              onPick={(point) => {
                void applyMapPoint(point);
              }}
            />
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={useMyLocationAsDest}
            disabled={locating}
          >
            {locating ? (
              <Loader2 className="spin" size={18} />
            ) : (
              <Crosshair size={18} />
            )}
            Usar mi ubicación como meta
          </button>

          {dest && (
            <div className="dest-chip">
              <MapPinned size={18} color="var(--ok)" style={{ marginTop: 2 }} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <strong>
                  {resolving ? "Resolviendo dirección…" : dest.label}
                </strong>
                {dest.subtitle && !resolving && (
                  <div className="muted" style={{ fontSize: "0.82rem" }}>
                    {dest.subtitle}
                  </div>
                )}
                <div className="row" style={{ marginTop: 4, gap: 4 }}>
                  {resolving ? (
                    <Loader2 className="spin" size={14} color="var(--muted)" />
                  ) : (
                    <Check size={14} color="var(--ok)" />
                  )}
                  <span className="muted" style={{ fontSize: "0.78rem" }}>
                    {dest.lat.toFixed(5)}, {dest.lng.toFixed(5)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <details className="advanced">
            <summary>
              <ChevronDown size={16} /> Más opciones
            </summary>
            <div className="stack" style={{ marginTop: "0.75rem" }}>
              <label className="field">
                <span>Quién puede entrar</span>
                <div className="input-wrap">
                  <select
                    value={joinMode}
                    onChange={(e) =>
                      setJoinMode(e.target.value as "OPEN" | "APPROVAL")
                    }
                  >
                    <option value="OPEN">Cualquiera con el código</option>
                    <option value="APPROVAL">Solo con tu aprobación</option>
                  </select>
                </div>
              </label>
              <label className="field">
                <span>PIN opcional (4 dígitos)</span>
                <div className="input-wrap">
                  <input
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="Vacío = sin PIN"
                  />
                </div>
              </label>
            </div>
          </details>
        </div>

        {error && (
          <div className="error-box">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="spin" size={18} /> Creando…
            </>
          ) : (
            "Crear sala"
          )}
        </button>
      </form>
    </main>
  );
}
