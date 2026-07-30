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
}

interface Props {
  dest: { lat: number; lng: number };
  players: MapPlayer[];
  followSelf?: boolean;
}

const STYLE =
  "https://tiles.openfreemap.org/styles/liberty";

export function RaceMap({ dest, players, followSelf = true }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markersRef = useRef<globalThis.Map<string, Marker>>(new globalThis.Map());
  const destMarkerRef = useRef<Marker | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [dest.lng, dest.lat],
      zoom: 12,
      attributionControl: {},
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    const el = document.createElement("div");
    el.style.width = "18px";
    el.style.height = "18px";
    el.style.borderRadius = "50%";
    el.style.background = "#f97316";
    el.style.border = "3px solid white";
    el.style.boxShadow = "0 0 0 2px #f97316";
    destMarkerRef.current = new maplibregl.Marker({ element: el })
      .setLngLat([dest.lng, dest.lat])
      .addTo(map);

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      destMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
    // only once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    destMarkerRef.current?.setLngLat([dest.lng, dest.lat]);
  }, [dest.lat, dest.lng]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seen = new Set<string>();
    for (const p of players) {
      seen.add(p.id);
      let marker = markersRef.current.get(p.id);
      if (!marker) {
        const el = document.createElement("div");
        el.title = p.label;
        el.style.width = p.isSelf ? "16px" : "12px";
        el.style.height = p.isSelf ? "16px" : "12px";
        el.style.borderRadius = "50%";
        el.style.background = p.color;
        el.style.border = "2px solid white";
        el.style.boxShadow = "0 1px 4px rgba(0,0,0,.4)";
        marker = new maplibregl.Marker({ element: el })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
        markersRef.current.set(p.id, marker);
      } else {
        marker.setLngLat([p.lng, p.lat]);
      }
    }

    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    const self = players.find((p) => p.isSelf);
    if (followSelf && self) {
      map.easeTo({ center: [self.lng, self.lat], duration: 500 });
    }
  }, [players, followSelf]);

  return <div ref={containerRef} className="map" data-testid="race-map" />;
}
