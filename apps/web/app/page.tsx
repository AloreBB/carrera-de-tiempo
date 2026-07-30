"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ChevronRight,
  Flag,
  History,
  Plus,
  Timer,
  Users,
} from "lucide-react";
import { getRecents, type RecentRace } from "@/lib/storage";

export default function HomePage() {
  const [recents, setRecents] = useState<RecentRace[]>([]);

  useEffect(() => {
    setRecents(getRecents());
  }, []);

  return (
    <main className="app-shell">
      <div className="hero-mark" aria-hidden>
        <Timer size={26} strokeWidth={2.2} />
      </div>

      <p className="eyebrow">
        <Flag size={12} /> En vivo
      </p>
      <h1 className="display">Carrera de Tiempo</h1>
      <p className="lead">
        Elige un destino, comparte el código y gana quien llegue primero. Sin
        cuentas: solo un apodo.
      </p>

      <div className="stack">
        <Link className="btn btn-primary btn-block" href="/create">
          <Plus size={18} strokeWidth={2.4} />
          Nueva carrera
        </Link>
        <Link className="btn btn-secondary btn-block" href="/join">
          <Users size={18} />
          Unirme con código
        </Link>
      </div>

      <section className="card" style={{ marginTop: "1.35rem" }}>
        <div className="row between" style={{ marginBottom: "0.35rem" }}>
          <h2 className="row" style={{ gap: 8, margin: 0 }}>
            <History size={16} color="var(--muted)" />
            Recientes
          </h2>
        </div>

        {recents.length === 0 ? (
          <p className="muted" style={{ margin: "0.4rem 0 0" }}>
            Aquí verás las carreras de este dispositivo.
          </p>
        ) : (
          <ul className="list-clean">
            {recents.map((r) => (
              <li key={r.code}>
                <div>
                  <strong
                    className="display"
                    style={{ letterSpacing: "0.12em", fontSize: "1rem" }}
                  >
                    {r.code}
                  </strong>
                  <div className="muted" style={{ fontSize: "0.82rem" }}>
                    {r.nickname} · {r.role === "host" ? "organizador" : "piloto"}
                  </div>
                </div>
                <Link
                  href={`/r/${r.code}`}
                  className="btn btn-ghost"
                  aria-label={`Abrir ${r.code}`}
                >
                  <ChevronRight size={20} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
