"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Info, X } from "lucide-react";

/** Liten i-ikon som öppnar en popover (intill ikonen) med stödtext om nyckeltalet.
 *  Stänger vid klick utanför och Escape. */
export function InfoPopover({
  title,
  children,
  label = "Om nyckeltalet",
}: {
  title?: string;
  children: React.ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={`grid h-32 w-32 place-items-center rounded-full border transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
          open
            ? "border-vattjom-surface-primary bg-vattjom-background-100 text-vattjom-text-primary"
            : "border-hairline text-dark-secondary hover:border-vattjom-surface-primary hover:text-vattjom-text-primary"
        }`}
      >
        <Info size={16} strokeWidth={2.2} aria-hidden="true" />
      </button>

      {open && (
        <div
          id={id}
          role="dialog"
          aria-label={label}
          className="absolute right-0 top-full z-30 mt-8 w-[300px] max-w-[80vw] rounded-12 border border-hairline bg-background-content p-16 shadow-lg"
        >
          <div className="mb-8 flex items-start justify-between gap-8">
            {title && <h4 className="font-header text-base font-bold tracking-tight">{title}</h4>}
            <button
              type="button"
              aria-label="Stäng"
              onClick={() => setOpen(false)}
              className="-mr-1 -mt-1 ml-auto grid h-24 w-24 shrink-0 place-items-center rounded-md text-dark-secondary transition hover:text-dark-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="space-y-8 text-small leading-relaxed text-dark-secondary">{children}</div>
        </div>
      )}
    </div>
  );
}
