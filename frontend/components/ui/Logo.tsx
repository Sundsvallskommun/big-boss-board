import * as React from "react";

/** Egen wordmark i kommunens visuella språk (ersätter @sk-web-gui Logo).
 *  Medvetet avsteg: detta är INTE Sundsvalls officiella logotyp, utan en enkel
 *  fristående märkning (emblem + ordbild) i vattjom-blå. `variant` finns kvar för
 *  API-paritet med tidigare anrop men påverkar inget. */
export function Logo({
  variant: _variant,
  className = "",
}: {
  variant?: string;
  className?: string;
}) {
  return (
    <span
      role="img"
      aria-label="Sundsvalls kommun"
      className={["inline-flex items-center gap-8 font-header leading-none", className].join(" ")}
    >
      <span
        aria-hidden="true"
        className="grid h-36 w-36 shrink-0 place-items-center rounded-12 bg-vattjom-surface-primary text-[18px] font-extrabold text-white"
      >
        S
      </span>
      <span aria-hidden="true" className="flex flex-col gap-2">
        <span className="text-[16px] font-extrabold tracking-tight text-dark-primary">
          Sundsvall
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-vattjom-text-primary">
          kommun
        </span>
      </span>
    </span>
  );
}
