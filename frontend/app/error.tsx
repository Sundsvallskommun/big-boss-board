"use client";

import { Button } from "@/components/ui";

/** Felgräns för sid-segmenten. Fångar fel som kastas under rendering/navigering
 *  (t.ex. när backend inte svarar) så att en misslyckad mjuk navigering blir en
 *  återställningsbar vy med "Försök igen" i stället för att navigeringen tyst fastnar.
 *  `reset()` renderar om segmentet på servern → nytt försök mot backend. */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main
      id="huvudinnehall"
      tabIndex={-1}
      className="mx-auto max-w-[640px] px-24 py-40 outline-none"
    >
      <h1 className="font-header text-h3 font-bold tracking-tight">Sidan kunde inte visas</h1>
      <p className="mt-8 text-base leading-relaxed text-dark-secondary">
        Tjänsten svarade inte just nu. Försök igen — det brukar räcka.
      </p>
      <div className="mt-24">
        <Button variant="primary" onClick={() => reset()}>
          Försök igen
        </Button>
      </div>
    </main>
  );
}
