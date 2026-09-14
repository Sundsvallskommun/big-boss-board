"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info, X } from "lucide-react";

/** Liten i-ikon som öppnar en popover med stödtext om nyckeltalet.
 *  Stänger vid klick utanför och Escape.
 *
 *  Panelen renderas i en **portal till body**, inte intill knappen. Skälet är att
 *  panelerna sitter inuti kort med `overflow-hidden` (rundade hörn klipper innehållet),
 *  och en absolut positionerad popover klipps då av kortets kant så snart den är högre
 *  än utrymmet nedanför knappen. Klippning går inte att lösa med z-index. Med portal +
 *  `position: fixed` ligger panelen ovanpå allt annat, inklusive den klistrade toppraden.
 */
export function InfoPopover({
  title,
  children,
  label = "Om nyckeltalet",
  bredd = 300,
}: {
  title?: string;
  children: React.ReactNode;
  label?: string;
  /** Panelbredd i px. Standard räcker för en kort stödtext; längre faktatexter med
   *  egen struktur behöver mer luft för att inte bli en smal spalt att skrolla i. */
  bredd?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; bredd: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

  /** Placera panelen under knappen, högerkanterna i linje. Vänd uppåt om den inte får
   *  plats nedanför, och håll den innanför fönstret i sidled. */
  const placera = useCallback(() => {
    const knapp = btnRef.current?.getBoundingClientRect();
    if (!knapp) return;
    const marginal = 16;
    const panelbredd = Math.min(bredd, window.innerWidth - marginal * 2);
    const hojd = panelRef.current?.offsetHeight ?? 240;

    let left = knapp.right - panelbredd;
    left = Math.max(marginal, Math.min(left, window.innerWidth - panelbredd - marginal));

    let top = knapp.bottom + 8;
    if (top + hojd > window.innerHeight - marginal) {
      const ovanfor = knapp.top - hojd - 8;
      top = ovanfor >= marginal ? ovanfor : Math.max(marginal, window.innerHeight - hojd - marginal);
    }
    setPos({ top, left, bredd: panelbredd });
  }, [bredd]);

  // Mät efter att panelen renderats — höjden är okänd innan dess.
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    placera();
  }, [open, placera]);

  // Panelen är dold under första mätningen och kan då inte ta emot fokus.
  const visible = open && pos !== null;
  useLayoutEffect(() => {
    if (visible) panelRef.current?.focus({ preventScroll: true });
  }, [visible]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const mal = e.target as Node;
      if (btnRef.current?.contains(mal) || panelRef.current?.contains(mal)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
      }
    }
    // Panelen är fixed och följer inte med sidan — flytta den i stället vid scroll.
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", placera, true);
    window.addEventListener("resize", placera);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", placera, true);
      window.removeEventListener("resize", placera);
    };
  }, [open, placera]);

  const panel = (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      tabIndex={-1}
      aria-label={label}
      style={{
        position: "fixed",
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: pos?.bredd ?? bredd,
        // Långa faktatexter ska rymmas: panelen växer till fönstrets höjd och scrollar
        // därefter internt. Utan taket hamnar slutet utanför skärmen, och eftersom
        // panelen är fixed går det inte att scrolla fram med sidan.
        maxHeight: "calc(100vh - 32px)",
        overflowY: "auto",
        // Innan första mätningen är läget okänt — göm i stället för att blinka till fel plats.
        visibility: pos ? "visible" : "hidden",
      }}
      className="z-[100] rounded-12 border border-hairline bg-background-content p-16 shadow-lg"
    >
      <div className="mb-8 flex items-start justify-between gap-8">
        {title && <h4 className="font-header text-base font-bold tracking-tight">{title}</h4>}
        <button
          type="button"
          aria-label="Stäng"
          onClick={() => { setOpen(false); btnRef.current?.focus(); }}
          className="-mr-1 -mt-1 ml-auto grid h-24 w-24 shrink-0 place-items-center rounded-md text-dark-secondary transition hover:text-dark-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="space-y-8 text-small leading-relaxed text-dark-secondary">{children}</div>
    </div>
  );

  return (
    <div className="shrink-0">
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={`grid h-32 w-32 place-items-center rounded-full border transition focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
          open
            ? "border-vattjom-surface-primary bg-vattjom-background-100 text-vattjom-text-primary"
            : "border-hairline text-dark-secondary hover:border-vattjom-surface-primary hover:text-vattjom-text-primary"
        }`}
      >
        <Info size={16} strokeWidth={2.2} aria-hidden="true" />
      </button>

      {open && typeof document !== "undefined" && createPortal(panel, document.body)}
    </div>
  );
}
