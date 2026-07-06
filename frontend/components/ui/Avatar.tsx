/** Avatar med initialer (shadcn-mönstret, implementerat i eget token-lager —
 *  appen drar inte in Radix/shadcn som beroende). Ingen bildkälla i v1: SAML-
 *  profilen har inget foto, så initialer ur namnet räcker. */
export function Avatar({ name, className = "" }: { name: string; className?: string }) {
  const initialer = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((del) => del[0]!.toUpperCase())
    .join("");

  return (
    <span
      aria-hidden="true"
      className={[
        "grid h-32 w-32 shrink-0 select-none place-items-center rounded-full",
        "bg-vattjom-background-100 text-small font-semibold text-vattjom-text-primary",
        className,
      ].join(" ")}
    >
      {initialer || "?"}
    </span>
  );
}
