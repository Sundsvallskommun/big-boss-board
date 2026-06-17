"use client";

import { useEffect, useState } from "react";

type Health = { status: string; service: string; db: string };

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Går via Next.js-rewrite /api/* -> backend (samma domän).
    fetch("/api/health")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setHealth)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Okänt fel"));
  }, []);

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "4rem 1.5rem" }}>
      <p style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: "#68686d" }}>
        Fas 0 · skelett
      </p>
      <h1 style={{ fontSize: 32, margin: "0.5rem 0 1rem" }}>Dialogstöd</h1>
      <p style={{ color: "#444450", lineHeight: 1.6 }}>
        Stacken är uppe. Designsystemet och den riktiga dashboarden byggs i kommande faser.
      </p>

      <section
        style={{
          marginTop: 24,
          padding: "1rem 1.25rem",
          background: "#fff",
          border: "1px solid #e5e5e5",
          borderRadius: 12,
        }}
      >
        <strong>Backend-status</strong>
        {error && <p style={{ color: "#a90074" }}>Kunde inte nå API: {error}</p>}
        {!error && !health && <p style={{ color: "#68686d" }}>Hämtar …</p>}
        {health && (
          <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.1rem", lineHeight: 1.7 }}>
            <li>Tjänst: {health.service}</li>
            <li>Status: {health.status}</li>
            <li>Databas: {health.db}</li>
          </ul>
        )}
      </section>
    </main>
  );
}
