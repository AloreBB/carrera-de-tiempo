"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getRecents, type RecentRace } from "@/lib/storage";

export default function HomePage() {
  const [recents, setRecents] = useState<RecentRace[]>([]);

  useEffect(() => {
    setRecents(getRecents());
  }, []);

  return (
    <main>
      <header style={{ marginBottom: "1.25rem", paddingTop: "0.5rem" }}>
        <p className="pill">PWA · coche / moto</p>
        <h1 style={{ fontSize: "1.85rem", marginTop: "0.75rem" }}>
          Carrera de Tiempo
        </h1>
        <p>
          Elige un destino, invita amigos y gana quien llegue primero. Sin
          cuentas, solo un apodo.
        </p>
      </header>

      <div className="stack">
        <Link className="btn" href="/create">
          Crear carrera
        </Link>
        <Link className="btn secondary" href="/join">
          Unirme con código
        </Link>
      </div>

      <section className="card" style={{ marginTop: "1.25rem" }}>
        <h2 style={{ fontSize: "1.05rem" }}>Recientes en este dispositivo</h2>
        {recents.length === 0 ? (
          <p className="muted">Aún no hay carreras aquí.</p>
        ) : (
          <ul className="list">
            {recents.map((r) => (
              <li key={r.code}>
                <div>
                  <strong>{r.code}</strong>
                  <div className="muted">
                    {r.nickname} · {r.role === "host" ? "host" : "piloto"}
                  </div>
                </div>
                <Link href={`/r/${r.code}`}>Abrir</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
