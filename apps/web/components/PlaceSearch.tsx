"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  Building2,
  Loader2,
  MapPin,
  Navigation,
  Route,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";

export interface PlaceResult {
  lat: number;
  lng: number;
  label: string;
  subtitle?: string;
  kind?: "place" | "address" | "street" | "city" | "other";
}

interface Props {
  value: string;
  onQueryChange: (q: string) => void;
  onSelect: (place: PlaceResult) => void;
  placeholder?: string;
}

function KindIcon({ kind }: { kind?: PlaceResult["kind"] }) {
  const props = { size: 18, strokeWidth: 2 } as const;
  switch (kind) {
    case "address":
      return <Building2 {...props} />;
    case "street":
      return <Route {...props} />;
    case "city":
      return <Navigation {...props} />;
    default:
      return <MapPin {...props} />;
  }
}

export function PlaceSearch({
  value,
  onQueryChange,
  onSelect,
  placeholder = "Buscar dirección, lugar o ciudad…",
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const q = value.trim();
    if (q.length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }

    setLoading(true);
    setError("");
    const id = ++reqId.current;
    const t = setTimeout(() => {
      api
        .geoSearch(q)
        .then((data) => {
          if (id !== reqId.current) return;
          setResults(data as PlaceResult[]);
          setOpen(true);
          setActive(0);
          setLoading(false);
        })
        .catch(() => {
          if (id !== reqId.current) return;
          setResults([]);
          setError("No se pudo buscar. Prueba otra vez.");
          setLoading(false);
          setOpen(true);
        });
    }, 280);

    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pick(place: PlaceResult) {
    onSelect(place);
    onQueryChange(place.label);
    setOpen(false);
    setResults([]);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      pick(results[active]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showPanel = open && value.trim().length >= 2;

  return (
    <div className="place-search" ref={wrapRef}>
      <div className="input-wrap">
        <Search className="icon" size={18} />
        <input
          value={value}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => value.trim().length >= 2 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
        />
        {loading && <Loader2 className="icon spin" size={18} />}
      </div>

      {showPanel && (
        <div className="suggest" id={listId} role="listbox">
          {error && <div className="suggest-empty">{error}</div>}
          {!error && !loading && results.length === 0 && (
            <div className="suggest-empty">
              Sin resultados. Prueba con calle, ciudad o nombre del lugar.
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.lat}-${r.lng}-${r.label}-${i}`}
              type="button"
              className="suggest-item"
              role="option"
              aria-selected={i === active}
              style={
                i === active
                  ? { background: "color-mix(in srgb, var(--amber) 12%, transparent)" }
                  : undefined
              }
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(r)}
            >
              <span style={{ color: "var(--amber)", marginTop: 2 }}>
                <KindIcon kind={r.kind} />
              </span>
              <span className="meta">
                <span className="title">{r.label}</span>
                {r.subtitle && <div className="sub">{r.subtitle}</div>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
