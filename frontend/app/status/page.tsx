import type { Metadata } from "next";
import Link from "next/link";
import {
  HelpCircle,
  CheckCircle2,
  CalendarDays,
  MessageSquareReply,
  MessageSquarePlus,
  FileText,
  Flag,
  Lightbulb,
  Inbox,
  Users,
  type LucideIcon,
} from "lucide-react";
import { StatusHeader } from "./StatusHeader";
import { Expandable } from "./Expandable";
import {
  listStatusContent,
  type StatusFraga,
  type Statusrapport,
} from "@/lib/api";
import { isAdmin } from "@/lib/auth";
import { listSubmissionsAdmin, type Submission } from "@/lib/admin-api";

export const metadata: Metadata = {
  title: "Frågor och beslut",
  description: "Överblick av öppna frågor och fattade beslut i projektet.",
  // Inte avsedd för indexering — nås via manuell URL.
  robots: { index: false, follow: false },
};

// Läser cookies (admin-inkorg) och färsk DB-data → aldrig statisk.
export const dynamic = "force-dynamic";

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

/** Etikett i kortets översikt för vilket forum/instans som äger frågan (t.ex. "Styrgrupp").
 *  Besvarade kort visar forum i svarsblocket; öppna/övergripande kort får det här. */
function ForumPill({ forum }: { forum: string }) {
  return (
    <span className="eyebrow-sm inline-flex items-center gap-6 rounded-full bg-vattjom-background-100 px-10 py-4 text-vattjom-text-primary">
      <Users size={12} aria-hidden="true" />
      {forum}
    </span>
  );
}

/** Indikator-pill i kortets översikt: "Förslag till beslut finns". */
function ForslagPill() {
  return (
    <span className="eyebrow-sm inline-flex items-center gap-6 rounded-full bg-vattjom-background-100 px-10 py-4 text-vattjom-text-primary">
      <Lightbulb size={12} aria-hidden="true" />
      Förslag till beslut
    </span>
  );
}

/** Egen ruta i kortet med själva förslaget till beslut (frågan förblir öppen). */
function ForslagRuta({ text }: { text: string }) {
  return (
    <div className="mt-16 rounded-12 border border-hairline bg-vattjom-background-100 p-16">
      <p className="eyebrow-sm flex items-center gap-6 text-vattjom-text-primary">
        <Lightbulb size={13} aria-hidden="true" />
        Förslag till beslut
      </p>
      <p className="mt-8 text-small leading-relaxed text-dark-primary">{text}</p>
    </div>
  );
}

/** Öppen fråga: gul accent, väntar på svar. */
function OppenKort({ q }: { q: StatusFraga }) {
  return (
    <li className="overflow-hidden rounded-12 border border-hairline border-l-[6px] border-l-status-warn bg-background-content">
      <div className="p-20">
        <div className="flex flex-wrap items-center gap-x-12 gap-y-6">
          <IdBricka id={q.nummer} />
          <span className="eyebrow-sm inline-flex items-center gap-6 rounded-full bg-warning-background-100 px-10 py-4 text-warning-text">
            <HelpCircle size={12} aria-hidden="true" />
            Väntar på svar
          </span>
          {q.forum && <ForumPill forum={q.forum} />}
          {q.forslag && <ForslagPill />}
        </div>
        <h3 className="mt-12 font-header text-large font-bold leading-snug tracking-tight">
          {q.fraga}
        </h3>
        {q.bakgrund && (
          <p className="mt-8 text-small leading-relaxed text-dark-secondary">
            {q.bakgrund}
          </p>
        )}

        {/* Förslag till beslut — egen ruta (frågan är fortfarande öppen tills beslut fattas). */}
        {q.forslag && <ForslagRuta text={q.forslag} />}

        {q.mer && <Expandable paragraphs={q.mer} />}
      </div>
    </li>
  );
}

/** Besvarad fråga: grön accent, fråga + tydligt svarsblock. */
function BesvaradKort({ q }: { q: StatusFraga }) {
  return (
    <li className="overflow-hidden rounded-12 border border-hairline border-l-[6px] border-l-status-good bg-background-content">
      <div className="p-20">
        <div className="flex flex-wrap items-center gap-x-12 gap-y-6">
          <IdBricka id={q.nummer} />
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

/** Övergripande/strategisk fråga: röd accent, hanteras utanför projektet. */
function OvergripandeKort({ q }: { q: StatusFraga }) {
  return (
    <li className="overflow-hidden rounded-12 border border-hairline border-l-[6px] border-l-status-alert bg-background-content">
      <div className="p-20">
        <div className="flex flex-wrap items-center gap-x-12 gap-y-6">
          <IdBricka id={q.nummer} />
          <span className="eyebrow-sm inline-flex items-center gap-6 rounded-full bg-error-background-200 px-10 py-4 text-error-text">
            <Flag size={12} aria-hidden="true" />
            Utanför projektet
          </span>
          {q.forum && <ForumPill forum={q.forum} />}
          {q.forslag && <ForslagPill />}
        </div>
        <h3 className="mt-12 font-header text-large font-bold leading-snug tracking-tight">
          {q.fraga}
        </h3>
        {q.bakgrund && (
          <p className="mt-8 text-small leading-relaxed text-dark-secondary">{q.bakgrund}</p>
        )}
        {q.forslag && <ForslagRuta text={q.forslag} />}
        {q.mer && <Expandable paragraphs={q.mer} />}
      </div>
    </li>
  );
}

/** Statusrapport: daterat kort med rubrik, text och valfria punkter. Blå accent. */
function StatusrapportKort({ r, senaste }: { r: Statusrapport; senaste: boolean }) {
  return (
    <li className="overflow-hidden rounded-12 border border-hairline border-l-[6px] border-l-vattjom-surface-primary bg-background-content">
      <div className="p-20">
        <div className="flex flex-wrap items-center gap-x-12 gap-y-6">
          <span className="eyebrow-sm inline-flex items-center gap-4 rounded-full bg-vattjom-background-100 px-10 py-4 text-vattjom-text-primary">
            <CalendarDays size={12} aria-hidden="true" />
            <time dateTime={r.datum}>{visaDatum(r.datum)}</time>
          </span>
          {senaste && (
            <span className="eyebrow-sm rounded-full bg-background-200 px-10 py-4 text-dark-secondary">
              Senaste
            </span>
          )}
        </div>
        <h3 className="mt-12 font-header text-large font-bold leading-snug tracking-tight">
          {r.rubrik}
        </h3>
        <p className="mt-8 text-small leading-relaxed text-dark-secondary">{r.text}</p>
        {r.punkter && r.punkter.length > 0 && (
          <ul className="mt-12 flex flex-col gap-6">
            {r.punkter.map((p, i) => (
              <li
                key={i}
                className="flex gap-8 text-small leading-relaxed text-dark-secondary"
              >
                <span
                  className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-vattjom-surface-primary"
                  aria-hidden="true"
                />
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
}

/** Färg/etikett per triage-status för en inkorgspost. */
const INKORG_STATUS: Record<string, { label: string; klass: string }> = {
  ny: { label: "Ny", klass: "bg-warning-background-100 text-warning-text" },
  granskad: { label: "Granskad", klass: "bg-vattjom-background-100 text-vattjom-text-primary" },
  publicerad: { label: "Publicerad", klass: "bg-success-background-200 text-success-text" },
  arkiverad: { label: "Arkiverad", klass: "bg-background-200 text-dark-secondary" },
};

/** Läsbart inkorgskort (endast admin): rå inlämning + triage-status. Redigeras via API. */
function InkorgKort({ s }: { s: Submission }) {
  const st = INKORG_STATUS[s.status] ?? INKORG_STATUS.ny;
  return (
    <li className="overflow-hidden rounded-12 border border-hairline border-l-[6px] border-l-divider bg-background-content">
      <div className="p-20">
        <div className="flex flex-wrap items-center gap-x-12 gap-y-6">
          <IdBricka id={s.id} />
          <span className={`eyebrow-sm inline-flex items-center gap-6 rounded-full px-10 py-4 ${st.klass}`}>
            {st.label}
          </span>
          <span className="eyebrow-sm inline-flex items-center gap-4">
            <CalendarDays size={12} aria-hidden="true" />
            <time dateTime={s.skapad_at}>{visaDatum(s.skapad_at.slice(0, 10))}</time>
          </span>
        </div>
        <p className="mt-12 whitespace-pre-wrap text-small leading-relaxed text-dark-primary">
          {s.text}
        </p>
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

export default async function StatusPage() {
  const { fragor, rapporter: rapporterRaw } = await listStatusContent();
  const admin = await isAdmin();
  const inkorg = admin ? await listSubmissionsAdmin() : [];

  const oppna = fragor.filter((q) => q.kategori === "fraga" && !q.svar);
  const besvarade = fragor.filter((q) => q.kategori === "fraga" && q.svar);
  const overgripande = fragor.filter((q) => q.kategori === "overgripande");
  const rapporter = [...rapporterRaw].sort((a, b) => b.datum.localeCompare(a.datum));

  // "Uppdaterad"-datum = senaste förekommande datum i innehållet (frågor/rapporter).
  const datumen = [
    ...fragor.map((q) => q.datum),
    ...rapporter.map((r) => r.datum),
  ].filter((d): d is string => !!d);
  const senast = datumen.sort().at(-1) ?? "";

  return (
    <>
      <StatusHeader uppdaterad={senast ? visaDatum(senast) : ""} />

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
            En överblick av frågor i projektet — de som väntar på svar och de som
            fått ett beslut — samt övergripande frågor som behöver hanteras utanför
            projektet.
          </p>
          <Link
            href="/status/skicka-in"
            className="mt-16 inline-flex items-center gap-8 rounded-12 bg-vattjom-surface-primary px-16 py-10 text-base font-semibold leading-none text-white transition hover:bg-[#004A99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <MessageSquarePlus size={16} aria-hidden="true" />
            Lämna en fråga eller synpunkt
          </Link>
        </div>

        {/* ===== Inkorg (endast admin) ===== */}
        {admin && (
          <section aria-labelledby="rubrik-inkorg" className="mt-32">
            <h2
              id="rubrik-inkorg"
              className="mb-4 flex items-center gap-10 font-header text-h4 font-bold tracking-tight"
            >
              <span className="text-dark-secondary" aria-hidden="true">
                <Inbox size={18} strokeWidth={2.2} />
              </span>
              Inkorg
              <span className="eyebrow-sm rounded-full bg-background-200 px-10 py-4 text-dark-secondary">
                endast admin
              </span>
            </h2>
            <p className="mb-16 text-small leading-relaxed text-dark-secondary">
              Inkomna inlämningar, nyast först. Syns bara för admin och publiceras aldrig
              automatiskt — triageras och läggs som kort i rätt kolumn via API.
            </p>
            {inkorg.length === 0 ? (
              <EmptyState>Inga inlämningar i inkorgen.</EmptyState>
            ) : (
              <ul className="grid grid-cols-1 gap-16 md:grid-cols-2">
                {inkorg.map((s) => (
                  <InkorgKort key={s.id} s={s} />
                ))}
              </ul>
            )}
          </section>
        )}

        {/* ===== Sammanfattning ===== */}
        <div className="mt-24 grid grid-cols-1 gap-16 sm:grid-cols-3">
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
          <SummaryTile
            icon={Flag}
            value={overgripande.length}
            label={overgripande.length === 1 ? "övergripande fråga" : "övergripande frågor"}
            accent="text-status-alert"
            tint="bg-error-background-200"
          />
        </div>

        {/* ===== Frågor i tre kolumner: öppna · besvarade · övergripande (utanför projektet) ===== */}
        <div className="mt-32 grid grid-cols-1 items-start gap-24 lg:grid-cols-3">
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

        {/* ===== Övergripande frågor (hanteras utanför projektet) ===== */}
        <section aria-labelledby="rubrik-overgripande">
          <h2
            id="rubrik-overgripande"
            className="mb-16 flex items-center gap-10 font-header text-h4 font-bold tracking-tight"
          >
            <span className="text-status-alert" aria-hidden="true">
              <Flag size={18} strokeWidth={2.2} />
            </span>
            Övergripande frågor
          </h2>
          {overgripande.length === 0 ? (
            <EmptyState>Inga övergripande frågor just nu.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-16">
              {overgripande.map((q, i) => (
                <OvergripandeKort key={i} q={q} />
              ))}
            </ul>
          )}
        </section>
        </div>

        {/* ===== Statusrapporter ===== */}
        <section aria-labelledby="rubrik-rapporter" className="mt-40">
          <h2
            id="rubrik-rapporter"
            className="mb-4 flex items-center gap-10 font-header text-h4 font-bold tracking-tight"
          >
            <span className="text-vattjom-text-primary" aria-hidden="true">
              <FileText size={18} strokeWidth={2.2} />
            </span>
            Statusrapporter
          </h2>
          <p className="mb-16 text-small leading-relaxed text-dark-secondary">
            Daterade lägesrapporter om arbetet — den senaste överst.
          </p>
          {rapporter.length === 0 ? (
            <EmptyState>Inga statusrapporter ännu.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-16">
              {rapporter.map((r, i) => (
                <StatusrapportKort key={`${r.datum}-${i}`} r={r} senaste={i === 0} />
              ))}
            </ul>
          )}
        </section>

        {/* ===== Dataregel ===== */}
        <p className="mt-32 text-small leading-snug text-dark-secondary">
          Sidan innehåller endast öppen projektinformation. Inga personuppgifter
          eller känsliga uppgifter — forum och roller anges, inte namngivna personer.
        </p>
      </main>
    </>
  );
}
