"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Hash } from "lucide-react";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <main className="app-shell">
      <Link href="/" className="back-link">
        <ArrowLeft size={16} /> Inicio
      </Link>

      <h1 className="display">Unirme</h1>
      <p className="lead">
        Pide el código de 6 caracteres a quien creó la carrera.
      </p>

      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (c.length >= 4) router.push(`/r/${c}`);
        }}
      >
        <div className="card">
          <label className="field">
            <span>Código de sala</span>
            <div className="input-wrap">
              <Hash className="icon" size={18} />
              <input
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))
                }
                placeholder="K7M2QX"
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
                required
                style={{
                  fontFamily: "var(--font-display)",
                  letterSpacing: "0.18em",
                  fontWeight: 700,
                  fontSize: "1.15rem",
                }}
              />
            </div>
          </label>
        </div>
        <button type="submit" className="btn btn-primary btn-block">
          Continuar <ArrowRight size={18} />
        </button>
      </form>
    </main>
  );
}
