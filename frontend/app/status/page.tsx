import type { Metadata } from "next";
import {
  HelpCircle,
  CheckCircle2,
  CalendarDays,
  MessageSquareReply,
  type LucideIcon,
} from "lucide-react";
import { StatusHeader } from "./StatusHeader";
import { Expandable } from "./Expandable";
import { FRAGOR, SENAST_UPPDATERAD, type Fraga } from "./data";

export const metadata: Metadata = {
  title: "Frågor och beslut",
  description: "Överblick av öppna frågor och fattade beslut i projektet.",
  // Inte avsedd för indexering — nås via manuell URL.
  robots: { index: false, follow: false },
};

const MANADER = [
  "jan", "feb", "mar", "apr", "maj", "jun",
  "jul", "aug", "sep", "okt", "nov", "dec",
];

/** ISO-datum (YYYY-MM-DD) → "22 jun 2026". Fritext returneras oförändrad.
 *  Görs manuellt för att undvika tidszons-/locale-skillnader vid SSR. */
function visaDatum(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const [, ar, man, dag] = m;
  return `${Number(dag)} ${MANADER[Number(man) - 1]} ${ar}`;
}

/** Stor sammanfattnings-bricka: siffra + etikett, färgkodad efter status. */
function SummaryTile({
  icon: Icon,
  value,
  label,
  accent,
  tint,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  accent: string;
  tint: string;
}) {
  return (
    <div
      className={`flex items-center gap-16 rounded-12 border border-hairline p-20 ${tint}`}
    >
      <span
        className={`grid h-48 w-48 shrink-0 place-items-center rounded-full bg-background-content ${accent}`}
      >
        <Icon size={24} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="flex flex-col">
        <span className="font-header text-h3 font-bold leading-none tracking-tight">
          {value}
        </span>
        <span className="mt-6 text-small font-semibold text-dark-secondary">
          {label}
        </span>
      </span>
    </div>
  );
}

/** Stabilt referens-id, visas som "#N". */
function IdBricka({ id }: { id: number }) {
  return (
    <span className="beslutsinstans rounded-md bg-background-200 px-8 py-4 tracking-normal">
      #{id}
    </span>
  );
}

/** Öppen fråga: gul accent, väntar på svar. */
function OppenKort({ q }: { q: Fraga }) {
  return (
    <li className="overflow-hidden rounded-12 border border-hairline border-l-[6px] border-l-status-warn bg-background-content">
      <div className="p-20">
        <div className="flex flex-wrap items-center gap-x-12 gap-y-6">
          <IdBricka id={q.id} />
          <span className="eyebrow-sm inline-flex items-center gap-6 rounded-full bg-warning-background-100 px-10 py-4 text-warning-text">
            <HelpCircle size={12} aria-hidden="true" />
            Väntar på svar
          </span>
        </div>
        <h3 className="mt-12 font-header text-large font-bold leading-snug tracking-tight">
          {q.fraga}
        </h3>
        {q.bakgrund && (
          <p className="mt-8 text-small leading-relaxed text-dark-secondary">
            {q.bakgrund}
          </p>
        )}
        {q.mer && <Expandable paragraphs={q.mer} />}
      </div>
    </li>
  );
}

/** Besvarad fråga: grön accent, fråga + tydligt svarsblock. */
function BesvaradKort({ q }: { q: Fraga }) {
  return (
    <li className="overflow-hidden rounded-12 border border-hairline border-l-[6px] border-l-status-good bg-background-content">
      <div className="p-20">
        <div className="flex flex-wrap items-center gap-x-12 gap-y-6">
          <IdBricka id={q.id} />
          <span className="eyebrow-sm inline-flex items-center gap-6 rounded-full bg-success-background-200 px-10 py-4 text-success-text">
            <CheckCircle2 size={12} aria-hidden="true" />
            Besvarad
          </span>
          {q.datum && (
            <span className="eyebrow-sm inline-flex items-center gap-4">
              <CalendarDays size={12} aria-hidden="true" />
              <time dateTime={q.datum}>{visaDatum(q.datum)}</time>
            </span>
          )}
        </div>

        <h3 className="mt-12 font-header text-large font-bold leading-snug tracking-tight">
          {q.fraga}
        </h3>
        {q.bakgrund && (
          <p className="mt-8 text-small leading-relaxed text-dark-secondary">
            {q.bakgrund}
          </p>
        )}

        {/* Svarsblock — visuellt avskilt så svaret är lätt att hitta. */}
        <div className="mt-16 rounded-12 bg-background-200 p-16">
          <p className="eyebrow-sm flex items-center gap-6 text-vattjom-text-primary">
            <MessageSquareReply size={13} aria-hidden="true" />
            Svar
          </p>
          <p className="mt-8 text-small leading-relaxed text-dark-primary">
            {q.svar}
          </p>
          {q.forum && (
            <p className="beslutsinstans mt-12 border-t border-hairline pt-12">
              {q.forum}
            </p>
          )}
        </div>
        {q.mer && <Expandable paragraphs={q.mer} />}
      </div>
    </li>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-12 border border-dashed border-hairline bg-background-content px-16 py-24 text-center text-small leading-snug text-dark-secondary">
      {children}
    </p>
  );
}

export default function StatusPage() {
  const oppna = FRAGOR.filter((q) => !q.svar);
  const besvarade = FRAGOR.filter((q) => q.svar);

  return (
    <>
      <StatusHeader uppdaterad={visaDatum(SENAST_UPPDATERAD)} />

      <main
        id="huvudinnehall"
        tabIndex={-1}
        className="mx-auto max-w-[1180px] px-24 pb-[96px] pt-32 outline-none md:px-32 md:pt-40"
      >
        {/* ===== Rubrik ===== */}
        <div>
          <p className="eyebrow mb-8">Arbetsgrupp · Styrgrupp</p>
          <h1 className="font-header text-h3 font-bold tracking-tight">
            Frågor och beslut
          </h1>
          <p className="mt-12 text-small leading-relaxed text-dark-secondary">
            En överblick av frågor i projektet: de som väntar på svar och de som
            fått ett beslut.
          </p>
        </div>

        {/* ===== Sammanfattning ===== */}
        <div className="mt-24 grid grid-cols-1 gap-16 sm:grid-cols-2">
          <SummaryTile
            icon={HelpCircle}
            value={oppna.length}
            label={oppna.length === 1 ? "öppen fråga" : "öppna frågor"}
            accent="text-status-warn"
            tint="bg-warning-background-100"
          />
          <SummaryTile
            icon={CheckCircle2}
            value={besvarade.length}
            label={besvarade.length === 1 ? "besvarad fråga" : "besvarade frågor"}
            accent="text-status-good"
            tint="bg-success-background-200"
          />
        </div>

        {/* ===== Frågor i två kolumner: öppna till vänster, besvarade till höger ===== */}
        <div className="mt-32 grid grid-cols-1 items-start gap-24 lg:grid-cols-2">
        {/* ===== Öppna frågor ===== */}
        <section aria-labelledby="rubrik-oppna">
          <h2
            id="rubrik-oppna"
            className="mb-16 flex items-center gap-10 font-header text-h4 font-bold tracking-tight"
          >
            <span className="text-status-warn" aria-hidden="true">
              <HelpCircle size={18} strokeWidth={2.2} />
            </span>
            Öppna frågor
          </h2>
          {oppna.length === 0 ? (
            <EmptyState>Inga öppna frågor just nu.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-16">
              {oppna.map((q, i) => (
                <OppenKort key={i} q={q} />
              ))}
            </ul>
          )}
        </section>

        {/* ===== Besvarade frågor ===== */}
        <section aria-labelledby="rubrik-besvarade">
          <h2
            id="rubrik-besvarade"
            className="mb-16 flex items-center gap-10 font-header text-h4 font-bold tracking-tight"
          >
            <span className="text-status-good" aria-hidden="true">
              <CheckCircle2 size={18} strokeWidth={2.2} />
            </span>
            Besvarade frågor
          </h2>
          {besvarade.length === 0 ? (
            <EmptyState>Inga besvarade frågor ännu.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-16">
              {besvarade.map((q, i) => (
                <BesvaradKort key={i} q={q} />
              ))}
            </ul>
          )}
        </section>
        </div>

        {/* ===== Dataregel ===== */}
        <p className="mt-32 text-small leading-snug text-dark-secondary">
          Sidan innehåller endast öppen projektinformation. Inga personuppgifter
          eller känsliga uppgifter — forum och roller anges, inte namngivna personer.
        </p>
      </main>
    </>
  );
}
