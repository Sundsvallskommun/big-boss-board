/** Laddningsvy för en förvaltnings dialog. Ger omedelbar återkoppling när man klickar
 *  på en förvaltning (URL:en byter direkt) i stället för att sidan ser ut att hänga. */
export default function Loading() {
  return (
    <main
      id="huvudinnehall"
      tabIndex={-1}
      className="mx-auto max-w-[1180px] px-24 pb-[96px] pt-40 outline-none md:px-32"
      aria-busy="true"
    >
      <div role="status" className="flex items-center gap-12 text-dark-secondary">
        <span
          aria-hidden="true"
          className="h-20 w-20 animate-spin rounded-full border-2 border-current border-r-transparent"
        />
        <span className="text-base">Laddar dialogen…</span>
      </div>
    </main>
  );
}
