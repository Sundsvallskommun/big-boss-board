import Link from "next/link";
import { ArrowRight, Upload } from "lucide-react";
import { listDialogues } from "@/lib/api";
import { BrandBar } from "@/components/BrandBar";
import { isAdmin } from "@/lib/auth";

// Alltid färsk data (dialoger kan ändras).
export const dynamic = "force-dynamic";

export default async function Home() {
  let dialogues;
  try {
    dialogues = await listDialogues();
  } catch {
    return (
      <main id="huvudinnehall" tabIndex={-1} className="mx-auto max-w-[640px] px-6 py-24 outline-none">
        <h1 className="font-header text-h3 font-bold tracking-tight">Dialogerna kunde inte hämtas</h1>
        <p className="mt-3 text-base leading-relaxed text-dark-secondary">
          Tjänsten svarar inte just nu. Försök igen om en stund.
        </p>
      </main>
    );
  }

  const sorted = [...dialogues].sort((a, b) =>
    a.organisation.namn.localeCompare(b.organisation.namn, "sv"),
  );
  const admin = await isAdmin();

  return (
    <>
      <BrandBar />

      <main
        id="huvudinnehall"
        tabIndex={-1}
        className="mx-auto max-w-[1180px] px-24 pb-[96px] pt-32 outline-none md:px-32 md:pt-40"
      >
        <div className="mb-32 flex flex-wrap items-start justify-between gap-x-32 gap-y-16">
          <div>
            <div className="eyebrow mb-8">Chefsuppföljning · välj verksamhet</div>
            <h1 className="font-header text-h1 font-bold leading-tight tracking-tight">
              Välj <span className="text-vattjom-text-primary">förvaltning</span>
            </h1>
            <p className="mt-8 max-w-[576px] text-base leading-relaxed text-dark-secondary">
              Öppna en uppföljningsdialog för att gå igenom nyckeltalen tillsammans, ett område i taget.
            </p>
          </div>
          {admin && (
            <Link
              href="/admin/import"
              className="inline-flex items-center gap-8 rounded-full border border-hairline bg-background-content px-16 py-8 text-small font-semibold transition hover:border-vattjom-surface-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Upload size={16} className="text-vattjom-text-primary" aria-hidden="true" />
              Importera HME
            </Link>
          )}
        </div>

        {sorted.length === 0 ? (
          <p className="rounded-12 border border-hairline bg-background-content p-64 text-base text-dark-secondary">
            Det finns inga dialoger att visa ännu.
          </p>
        ) : (
          <ul
            className="grid gap-12"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}
          >
            {sorted.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/dialog/${d.id}`}
                  className="flex h-full flex-col justify-between gap-16 rounded-12 border border-hairline bg-background-content p-20 transition hover:-translate-y-2 hover:border-dark-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
        )}
      </main>
    </>
  );
}
