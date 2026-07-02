import Link from "next/link";

/** Varumärkeslås i headern (samma stil som systerappen Verktyg): kommunens officiella
 *  logotyp + avdelare + produktnamnet "Dialogstöd" i rubriktypsnittet. Länkar till start. */
export function BrandLockup() {
  return (
    <Link
      href="/"
      aria-label="Dialogstöd – till startsidan"
      className="flex items-center gap-16 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
    >
      {/* Sundsvalls kommuns officiella logotyp (svart variant, ui.sundsvall.dev).
          Plain <img> är medvetet: en lokal SVG behöver ingen next/image-optimering. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/sundsvalls-kommun-logotyp.svg"
        alt="Sundsvalls kommun"
        className="block h-40 w-auto"
      />
      <span className="h-32 w-px shrink-0 bg-divider" aria-hidden="true" />
      <span className="whitespace-nowrap font-header text-[19px] font-bold leading-none tracking-tight text-dark-primary">
        Dialogstöd
      </span>
    </Link>
  );
}
