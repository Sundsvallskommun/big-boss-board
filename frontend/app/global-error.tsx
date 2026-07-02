"use client";

/** Sista skyddsnätet: fångar fel i rot-layouten (ersätter hela dokumentet, så det
 *  måste rendera egna <html>/<body>). Token-lagret kan saknas här — håll det enkelt
 *  och självständigt med inline-stil. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="sv">
      <body style={{ fontFamily: "Arial, sans-serif", margin: 0, padding: "48px 24px", color: "#1F1F25" }}>
        <main style={{ maxWidth: 640, margin: "0 auto" }}>
          <h1 style={{ fontSize: 24, fontWeight: 700 }}>Något gick fel</h1>
          <p style={{ marginTop: 8, color: "#51515C", lineHeight: 1.6 }}>
            Ladda om sidan för att fortsätta.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              marginTop: 24,
              padding: "10px 16px",
              borderRadius: 12,
              border: "none",
              background: "#0055B8",
              color: "#fff",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Försök igen
          </button>
        </main>
      </body>
    </html>
  );
}
