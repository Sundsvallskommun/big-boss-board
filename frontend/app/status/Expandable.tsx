"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";

/** Utfällbar text på ett kort: sammanfattningen visas alltid ovanför, det här är
 *  den längre fördjupningen som kan flikas ut. Generisk — används av alla kort på
 *  status-sidan som har en `mer`-text. */
export function Expandable({ paragraphs }: { paragraphs: string[] }) {
  const [open, setOpen] = useState(false);
  const regionId = useId();

  return (
    <div className="mt-12">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-6 rounded-md text-small font-semibold text-vattjom-text-primary transition hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ChevronDown
          size={14}
          strokeWidth={2.4}
          aria-hidden="true"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
        {open ? "Visa mindre" : "Visa mer"}
      </button>

      {/* Växla display via klass — INTE `hidden`-attributet: en `flex`-utility skulle
          annars överstyra `[hidden]{display:none}` och texten visas alltid. */}
      <div
        id={regionId}
        className={open ? "mt-10 flex flex-col gap-8" : "hidden"}
      >
        {paragraphs.map((p, i) => (
          <p key={i} className="text-small leading-relaxed text-dark-secondary">
            {p}
          </p>
        ))}
      </div>
    </div>
  );
}
