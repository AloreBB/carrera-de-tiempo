"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <main>
      <p>
        <a href="/">← Inicio</a>
      </p>
      <h1>Unirme</h1>
      <p className="muted">Introduce el código de 6 caracteres.</p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          const c = code.trim().toUpperCase();
          if (c.length >= 4) router.push(`/r/${c}`);
        }}
      >
        <div className="card">
          <label>
            Código
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="K7M2QX"
              maxLength={6}
              autoCapitalize="characters"
              required
            />
          </label>
        </div>
        <button type="submit">Continuar</button>
      </form>
    </main>
  );
}
