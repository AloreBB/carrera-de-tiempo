"use client";

import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import type { Map as MaplibreMap, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapPoint {
  lat: number;
  lng: number;
}

interface Props {
  /** Selected destination; if null map uses center default */
  value: MapPoint | null;
  /** Map center when no value (e.g. user GPS) */
  defaultCenter?: MapPoint;
  onPick: (point: MapPoint) => void;
  className?: string;
}

const STYLE = "https://tiles.openfreemap.org/styles/liberty";
const FALLBACK: MapPoint = { lat: 40.4168, lng: -3.7038 };

function pinElement() {
  const el = document.createElement("div");
  el.style.width = "20px";
  el.style.height = "20px";
  el.style.borderRadius = "50%";
  el.style.background = "#ffb020";
  el.style.border = "3px solid #fff";
  el.style.boxShadow = "0 0 0 2px rgba(255,176,32,.45), 0 2px 10px rgba(0,0,0,.45)";
  el.style.cursor = "grab";
  return el;
}

export function DestinationPickerMap({
  value,
  defaultCenter,
  onPick,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MaplibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  onPickRef.current = onPick;

  // init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const start = value ?? defaultCenter ?? FALLBACK;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      center: [start.lng, start.lat],
      zoom: value ? 14 : 11,
      attributionControl: {},
    });
    map.addControl(
      new maplibregl.NavigationControl({ showCompass: false }),
      "top-right",
    );
    mapRef.current = map;

    const marker = new maplibregl.Marker({
      element: pinElement(),
      draggable: true,
    })
      .setLngLat([start.lng, start.lat])
      .addTo(map);
    markerRef.current = marker;

    // hide pin until first pick if no value
    if (!value) {
      marker.getElement().style.opacity = "0.35";
    }

    const emit = (lat: number, lng: number) => {
      marker.getElement().style.opacity = "1";
      onPickRef.current({ lat, lng });
    };

    map.on("click", (e) => {
      const { lat, lng } = e.lngLat;
      marker.setLngLat([lng, lat]);
      emit(lat, lng);
    });

    marker.on("dragend", () => {
      const ll = marker.getLngLat();
      emit(ll.lat, ll.lng);
    });

    // resize after layout
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sync external value (search / my location)
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker || !value) return;
    marker.setLngLat([value.lng, value.lat]);
    marker.getElement().style.opacity = "1";
    map.easeTo({ center: [value.lng, value.lat], zoom: Math.max(map.getZoom(), 13), duration: 450 });
  }, [value?.lat, value?.lng]);

  // fly to defaultCenter once when GPS arrives and no dest yet
  useEffect(() => {
    const map = mapRef.current;
    if (!map || value || !defaultCenter) return;
    map.easeTo({
      center: [defaultCenter.lng, defaultCenter.lat],
      zoom: 12,
      duration: 600,
    });
  }, [defaultCenter?.lat, defaultCenter?.lng, value]);

  return (
    <div className={className ?? "map map-picker"} data-testid="dest-picker-map">
      <div ref={containerRef} className="map-picker-canvas" />
      <div className="map-picker-hint">
        Toca el mapa o arrastra el pin para fijar la meta
      </div>
    </div>
  );
}
