import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { listDialogues, type DialogueSummary } from "@/lib/api";
import { BrandBar } from "@/components/BrandBar";

// Alltid färsk data (dialoger kan ändras).
export const dynamic = "force-dynamic";

/** Sidans två sektionsrubriker. Samma komponent för båda, så "Välj bolag/förbund" blir
 *  garanterat identisk med "Välj förvaltning" i stället för bara lik. Rubriknivån skiljer
 *  sig ändå: h1 är sidans rubrik, h2 den andra sektionens, så rubrikordningen förblir
 *  korrekt för skärmläsare även när de ser lika stora ut. */
function ValjRubrik({ niva: Tagg, ord }: { niva: "h1" | "h2"; ord: string }) {
  return (
    <Tagg className="font-header text-h1 font-bold leading-tight tracking-tight">
      Välj <span className="text-vattjom-text-primary">{ord}</span>
    </Tagg>
  );
}

/** Kortrutnätet med dialoger. Utbrutet så att förvaltningarna och koncernens övriga
 *  verksamheter renderas exakt likadant — grupperna skiljs åt av rubriken, inte av korten. */
function Dialoglista({ dialoger }: { dialoger: DialogueSummary[] }) {
  return (
    <ul
      className="grid gap-12"
      style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
    >
      {dialoger.map((d) => (
        <li key={d.id}>
          <Link
            href={`/dialog/${d.id}`}
            className="flex h-full flex-col justify-between gap-16 rounded-12 border border-hairline bg-background-content p-20 transition hover:-translate-y-2 hover:border-dark-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <div>
              <div className="font-header text-base font-bold leading-tight tracking-tight">
                {d.organisation.namn}
              </div>
              <div className="mt-2 text-small text-dark-secondary">Sundsvalls kommun</div>
            </div>
            <div className="flex items-center justify-between">
              <span className="eyebrow-sm text-dark-secondary">Öppna dialog</span>
              <ArrowRight size={16} className="text-vattjom-text-primary" aria-hidden="true" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function Home() {
  // Fel bubblar till app/error.tsx (återställningsbar vy med "Försök igen").
  const dialogues = await listDialogues();

  const sorted = [...dialogues].sort((a, b) =>
    a.organisation.namn.localeCompare(b.organisation.namn, "sv"),
  );
  // Koncernens övriga verksamheter (Stadsbacken, Medelpads Räddningstjänstförbund) är inte
  // förvaltningar och läggs i en egen grupp under. Flaggan saknas i äldre API-svar — utan
  // den behandlas verksamheten som förvaltning, så listan aldrig tappar en post.
  const forvaltningar = sorted.filter((d) => d.organisation.ar_forvaltning !== false);
  const ovriga = sorted.filter((d) => d.organisation.ar_forvaltning === false);

  return (
    <>
      <BrandBar />

      <main
        id="huvudinnehall"
        tabIndex={-1}
        className="mx-auto max-w-[1180px] px-24 pb-[96px] pt-32 outline-hidden md:px-32 md:pt-40"
      >
        <div className="mb-32 flex flex-wrap items-start justify-between gap-x-32 gap-y-16">
          <div>
            <div className="eyebrow mb-8">Chefsuppföljning · välj verksamhet</div>
            <ValjRubrik niva="h1" ord="förvaltning" />
            <p className="mt-8 max-w-[576px] text-base leading-relaxed text-dark-secondary">
              Öppna en uppföljningsdialog för att gå igenom nyckeltalen tillsammans, ett område i taget.
            </p>
          </div>
        </div>

        {sorted.length === 0 ? (
          <p className="rounded-12 border border-hairline bg-background-content p-64 text-base text-dark-secondary">
            Det finns inga dialoger att visa ännu.
          </p>
        ) : (
          <>
            <Dialoglista dialoger={forvaltningar} />
            {ovriga.length > 0 && (
              // Ingen avdelarlinje: sektionerna ska läsa som jämlikar, och den stora
              // rubriken bryter sidan tydligt nog på egen hand.
              <section className="mt-48">
                <ValjRubrik niva="h2" ord="bolag/förbund" />
                <p className="mb-32 mt-8 max-w-[576px] text-base leading-relaxed text-dark-secondary">
                  Kommunala bolag och kommunalförbund i koncernen. Alla nyckeltal följs ännu
                  inte upp med mätdata — de kort som saknar underlag sätts manuellt i dialogen.
                </p>
                <Dialoglista dialoger={ovriga} />
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}
