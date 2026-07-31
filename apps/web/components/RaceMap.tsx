"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MaplibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapPlayer {
  id: string;
  lat: number;
  lng: number;
  color: string;
  label: string;
  isSelf?: boolean;
  /** Degrees clockwise from north; used for self chevron when racing */
  bearing?: number | null;
}

interface Props {
  dest: { lat: number; lng: number };
  players: MapPlayer[];
  followSelf?: boolean;
  /** Waze-like drive mode: pitch + heading + tighter zoom */
  navigationMode?: boolean;
  className?: string;
}

/**
 * OpenFreeMap (no key). Dark “fiord” reads closer to night-nav apps;
 * liberty as fallback if style fails to load.
 * MapTiler / other keys can be wired later via env without changing the client API.
 */
const STYLE_PRIMARY = "https://tiles.openfreemap.org/styles/fiord";
const STYLE_FALLBACK = "https://tiles.openfreemap.org/styles/liberty";

function destElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "race-map-dest";
  el.innerHTML = `<span class="race-map-dest-pin"></span>`;
  return el;
}

function playerElement(p: MapPlayer): HTMLDivElement {
  const el = document.createElement("div");
  el.title = p.label;
  if (p.isSelf) {
    el.className = "race-map-self";
    el.innerHTML = `<span class="race-map-self-chevron" style="background:${p.color}"></span>`;
  } else {
    el.className = "race-map-rival";
    el.style.background = p.color;
  }
  return el;
}

export function RaceMap({
  dest,
  players,
  followSelf = true,
  navigationMode = false,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markersRef = useRef<globalThis.Map<string, Marker>>(new globalThis.Map());
  const destMarkerRef = useRef<Marker | null>(null);
  const lastSelfRef = useRef<{ lat: number; lng: number } | null>(null);
  const navModeRef = useRef(navigationMode);
  navModeRef.current = navigationMode;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_PRIMARY,
      center: [dest.lng, dest.lat],
      zoom: 13,
      pitch: 0,
      bearing: 0,
      attributionControl: { compact: true },
      // Smoother feel on mobile
      fadeDuration: 0,
    });

    map.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        visualizePitch: true,
      }),
      "bottom-right",
    );

    map.on("error", (e) => {
      // Style/tile errors — try liberty once
      const msg = String(e.error?.message ?? e.error ?? "");
      if (msg && map.getStyle()?.name !== "Liberty") {
        try {
          map.setStyle(STYLE_FALLBACK);
        } catch {
          /* ignore */
        }
      }
    });

    mapRef.current = map;

    destMarkerRef.current = new maplibregl.Marker({
      element: destElement(),
      anchor: "bottom",
    })
      .setLngLat([dest.lng, dest.lat])
      .addTo(map);

    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      destMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // init once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    destMarkerRef.current?.setLngLat([dest.lng, dest.lat]);
  }, [dest.lat, dest.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Toggle navigation camera
    if (navigationMode) {
      map.easeTo({
        pitch: 55,
        zoom: Math.max(map.getZoom(), 16),
        duration: 600,
      });
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 400 });
    }
  }, [navigationMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    for (const p of players) {
      seen.add(p.id);
      let marker = markersRef.current.get(p.id);
      if (!marker) {
        marker = new maplibregl.Marker({
          element: playerElement(p),
          anchor: p.isSelf ? "center" : "center",
          rotationAlignment: p.isSelf ? "map" : "auto",
          pitchAlignment: p.isSelf ? "map" : "auto",
        })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
        markersRef.current.set(p.id, marker);
      } else {
        marker.setLngLat([p.lng, p.lat]);
      }

      if (p.isSelf) {
        const el = marker.getElement();
        const chevron = el.querySelector(".race-map-self-chevron") as HTMLElement | null;
        const bearing = p.bearing ?? 0;
        if (chevron) {
          chevron.style.transform = `rotate(${bearing}deg)`;
        }
      }
    }

    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    const self = players.find((x) => x.isSelf);
    if (followSelf && self) {
      const prev = lastSelfRef.current;
      let bearing = self.bearing;
      if (
        (bearing == null || Number.isNaN(bearing)) &&
        prev &&
        (Math.abs(prev.lat - self.lat) > 1e-6 || Math.abs(prev.lng - self.lng) > 1e-6)
      ) {
        // haversine bearing from previous sample
        const φ1 = (prev.lat * Math.PI) / 180;
        const φ2 = (self.lat * Math.PI) / 180;
        const Δλ = ((self.lng - prev.lng) * Math.PI) / 180;
        const y = Math.sin(Δλ) * Math.cos(φ2);
        const x =
          Math.cos(φ1) * Math.sin(φ2) -
          Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
        bearing = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
      }

      lastSelfRef.current = { lat: self.lat, lng: self.lng };

      if (navModeRef.current) {
        map.easeTo({
          center: [self.lng, self.lat],
          bearing: bearing ?? map.getBearing(),
          pitch: 55,
          zoom: Math.max(map.getZoom(), 16),
          duration: 450,
          essential: true,
        });
      } else {
        map.easeTo({
          center: [self.lng, self.lat],
          duration: 500,
        });
      }
    }
  }, [players, followSelf]);

  return (
    <div
      ref={containerRef}
      className={className ?? "map"}
      data-testid="race-map"
    />
  );
}
