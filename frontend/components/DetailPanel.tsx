"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Button, FormControl, FormLabel, Input, Textarea } from "@/components/ui";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  TriangleAlert,
  BarChart3,
  ListChecks,
  Plus,
  CheckCircle2,
  ChevronDown,
  Gauge,
  Target,
  LineChart,
  ArrowDown,
  Coins,
} from "lucide-react";
import type { Activity, DialogueArea } from "@/lib/api";
import { areaIcon } from "./icons";
import { STATUS, measurementTokens } from "./status";
import {
  diffText,
} from "@/lib/ekonomi";
import {
  KR_PER_ANSTALLD_PE_AR,
  KR_PER_ANSTALLD_PE_MANAD,
  SJUK_MAL,
  krText,
  sjukKostnad,
} from "@/lib/sjukfranvaro";
import { InfoPopover } from "./InfoPopover";
import { SjukfranvaroNivaer } from "./SjukfranvaroNivaer";

/** Diagrammen laddas bara i webbläsaren (ssr: false). recharts är tungt att
 *  server-rendera och ger inget värde på servern (ResponsiveContainer mäter först
 *  DOM:en i klienten). Att hålla dem utanför SSR gör att dialog-sidan renderas lätt
 *  även under samtidig last — annars kan flera samtidiga renderingar mätta
 *  frontend-processen. En platshållare i rätt höjd håller layouten stabil. */
const ChartPlaceholder = ({ height }: { height: number }) => (
  <div
    className="w-full animate-pulse rounded-8 bg-background-200"
    style={{ height }}
    aria-hidden="true"
  />
);

const HmeNivaer = dynamic(() => import("./HmeNivaer").then((m) => m.HmeNivaer), {
  ssr: false,
  loading: () => <ChartPlaceholder height={320} />,
});

const EkonomiDiffChart = dynamic(
  () => import("./charts/EkonomiDiffChart").then((m) => m.EkonomiDiffChart),
  { ssr: false, loading: () => <ChartPlaceholder height={340} /> },
);
const SjukfranvaroChart = dynamic(
  () => import("./charts/SjukfranvaroChart").then((m) => m.SjukfranvaroChart),
  { ssr: false, loading: () => <ChartPlaceholder height={360} /> },
);

type Feedback = { kind: "ok" | "err"; msg: string } | null;

/** Svensk ordningsändelse för datum i intervallet vi bryr oss om (1:a, 2:a, annars N:e). */
function ordningsdag(day: number): string {
  return day === 1 || day === 2 ? `${day}:a` : `${day}:e`;
}

/** Ekonomidata fylls på löpande och är fullständig först runt den 10:e (senare i januari).
 *  Returnerar info om innevarande dag fortfarande ligger i det ofullständiga fönstret. */
function ekonomiOfullstandig(now: Date): { ofullstandig: boolean; dag: string; klarText: string } {
  const day = now.getDate();
  const jan = now.getMonth() === 0;
  const cutoff = jan ? 15 : 9;
  return {
    ofullstandig: day <= cutoff,
    dag: ordningsdag(day),
    klarText: jan ? "omkring den 15:e eller senare" : "omkring den 10:e",
  };
}

const MANADER = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** ISO-datum → "24 jun" (deterministiskt, ingen locale → ingen hydrerings-krock). */
function kortDatum(iso: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  return m ? `${Number(m[3])} ${MANADER[Number(m[2]) - 1]}` : "";
}

/** En aktivitet i listan: checklist-markör + text + Klar-rapportering med kort notering. */
/** Månadsstängning → "jul" eller "jul 26" för sjukfrånvarons R12-axel.
 *
 *  Tolv rullande månader spänner alltid över ett årsskifte, så året måste framgå någonstans
 *  — men inte på varje tick: tolv etiketter à "aug 25" ryms inte i panelen på en telefon.
 *  Året sätts därför ut på seriens första punkt och på varje januari, som är precis där
 *  det byter. */
function sjukManadKort(iso: string | undefined, medAr: boolean): string {
  const mm = iso ? /^(\d{4})-(\d{2})/.exec(iso) : null;
  if (!mm) return "Period";
  const namn = MANADER[Number(mm[2]) - 1] ?? "";
  return medAr ? `${namn} ${mm[1].slice(2)}` : namn;
}

/** Månadsstängning → "juli 2026" i löpande text. */
function sjukManadLang(iso?: string): string {
  const mm = iso ? /^(\d{4})-(\d{2})/.exec(iso) : null;
  if (!mm) return "";
  const langa = ["januari", "februari", "mars", "april", "maj", "juni",
    "juli", "augusti", "september", "oktober", "november", "december"];
  return `${langa[Number(mm[2]) - 1] ?? ""} ${mm[1]}`;
}

/** Periodens ISO-datum → månadsetikett "Maj 2026" (deterministiskt, ingen locale). */
function ekonomiManadEtikett(period?: string): string {
  const mm = period ? /^(\d{4})-(\d{2})/.exec(period) : null;
  if (!mm) return "Aktuell period";
  const namn = MANADER[Number(mm[2]) - 1] ?? "";
  return `${namn.charAt(0).toUpperCase()}${namn.slice(1)} ${mm[1]}`;
}

/** Kort månadsetikett ("Jun") för X-axeln när serien har flera månader. */
function ekonomiManadKort(period?: string): string {
  const mm = period ? /^(\d{4})-(\d{2})/.exec(period) : null;
  if (!mm) return "Period";
  const namn = MANADER[Number(mm[2]) - 1] ?? "";
  return `${namn.charAt(0).toUpperCase()}${namn.slice(1)}`;
}

function ActivityRow({
  activity,
  onMarkKlar,
}: {
  activity: Activity;
  onMarkKlar: (activityId: number, notering: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [notering, setNotering] = useState("");
  const [busy, setBusy] = useState(false);

  async function spara() {
    setBusy(true);
    try {
      await onMarkKlar(activity.id, notering);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      className={`rounded-12 border p-16 ${
        activity.klar
          ? "border-success-background-300 bg-success-background-200"
          : "border-hairline bg-background-content"
      }`}
    >
      <div className="flex items-start gap-12">
        {/* Checklist-markör: tom ring (ej klar) / grön bock (klar) */}
        <span className="mt-1 shrink-0" aria-hidden="true">
          {activity.klar ? (
            <CheckCircle2 size={18} className="text-status-good" />
          ) : (
            <span className="block h-[18px] w-[18px] rounded-full border-2 border-hairline" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className={`text-small leading-snug ${activity.klar ? "text-dark-secondary line-through" : ""}`}>
            {activity.text}
          </p>

          {activity.klar && (
            <div className="mt-10 rounded-[10px] bg-success-background-300 px-12 py-10">
              <div className="eyebrow-sm text-success-text">
                Klarrapport{kortDatum(activity.klar_at) && ` · ${kortDatum(activity.klar_at)}`}
              </div>
              <p className="mt-2 text-small leading-snug text-dark-primary">
                {activity.klar_notering || "—"}
              </p>
            </div>
          )}

          {open && !activity.klar && (
            <div className="mt-12">
              <FormControl className="w-full">
                <FormLabel>Notering om klarrapporteringen</FormLabel>
                <Input
                  value={notering}
                  onChange={(e) => setNotering(e.target.value)}
                  maxLength={1000}
                  placeholder="Kort notering om vad som gjorts…"
                />
              </FormControl>
              <div className="mt-10 flex flex-wrap gap-8">
                <Button
                  color="vattjom"
                  variant="primary"
                  loading={busy}
                  disabled={busy}
                  onClick={spara}
                  leftIcon={<CheckCircle2 size={16} aria-hidden="true" />}
                >
                  Spara klarrapport
                </Button>
                <Button color="vattjom" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                  Avbryt
                </Button>
              </div>
            </div>
          )}
        </div>

        {!activity.klar && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex shrink-0 items-center gap-4 rounded-full border border-vattjom-surface-primary px-10 py-3 text-[12px] font-semibold text-vattjom-text-primary transition hover:bg-vattjom-background-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <CheckCircle2 size={13} aria-hidden="true" />
            Klarmarkera
          </button>
        )}
      </div>
    </li>
  );
}

export function DetailPanel({
  item,
  index,
  total,
  activities,
  organisationKod,
  onAddActivity,
  onMarkKlar,
}: {
  item: DialogueArea;
  index: number;
  total: number;
  activities: Activity[];
  /** Masterdata-kod för förvaltningen — nyckel till referensdata (antal anställda). */
  organisationKod?: string | null;
  onAddActivity: (text: string) => Promise<void>;
  onMarkKlar: (activityId: number, notering: string) => Promise<void>;
}) {
  const { area } = item;
  // DetailPanel renderas bara för nyckeltal MED mätdata (Dashboard väljer QuestionPanel
  // för dem utan) — assertion är därför säker och håller typerna nöjda.
  const m = item.measurement!;
  const AreaIcon = areaIcon(area.ikon);
  // Ekonomi visar ingen trend: jämförelsen mot föregående år finns redan i
  // nettokostnadsdiagrammet (serien "Ack utfall fg år"), och en trendruta ovanpå det
  // sa samma sak en gång till — fast utan periodens sammanhang.
  const visaTrend = area.key !== "ekonomi";
  // Trend kan saknas (ingen jämförelseperiod) → neutral platshållare utan riktningspil.
  const hasTrend = m.trend_dir !== null;
  const TrendIcon = !hasTrend ? Minus : m.trend_dir === "up" ? TrendingUp : TrendingDown;
  const trendColor = !hasTrend
    ? "text-dark-secondary"
    : m.trend_good
    ? "text-status-good"
    : "text-status-alert";

  const hme = m.details?.typ === "hme" ? m.details : null;
  const ekonomi = m.details?.typ === "ekonomi" ? m.details : null;
  const ekNetto = ekonomi?.resultatrakning?.find((r) => r.matt_kod === "SK.EK.RR.005") ?? null;
  const sjuk = m.details?.typ === "sjukfranvaro" && m.details.matmetod === "rullande12" ? m.details : null;
  // Estimerad kostnad för sjukfrånvaron — översätter procenten till kronor så att
  // dialogen kan tala om vad frånvaron faktiskt kostar. null när underlag saknas.
  // Antalet tillsvidareanställda kommer med importen (SK.P.AM.001) och följer därmed
  // perioden. Saknas det faller beräkningen tillbaka på reservtabellen i lib/sjukfranvaro.
  const sjukKost = sjuk ? sjukKostnad(organisationKod, m.value_num, sjuk.anstallda) : null;
  // Perioden i löpande text ("juli 2026") — används där rutan ska säga vilket uttag
  // underlaget kommer ur.
  const sjukPeriodText = sjuk ? sjukManadLang(sjuk.period) : "";
  // Diagrammet visar det senaste årets månadsstängningar. Serien kan vara längre än så
  // (importen sparar allt som lästs in) — men tolv punkter är ett år, och äldre punkter
  // skulle bara komprimera x-axeln utan att tillföra något i samtalet.
  const sjukAllaPunkter = sjuk?.serie ?? [];
  const sjukSerie = sjukAllaPunkter.slice(-12).map((p, i) => ({
    period: sjukManadKort(p.period, i === 0 || p.period.slice(5, 7) === "01"),
    total: p.total ?? null,
    kvinnor: p.kvinnor ?? null,
    man: p.man ?? null,
  }));
  // Diffdiagrammet: hela årsserien om den finns, annars bara senaste perioden.
  const ekPunkt = (manad: string, r: { diff?: number | null; korrigerad?: boolean }) => ({
    manad,
    diff: r.diff ?? null,
    korrigerad: r.korrigerad ?? false,
  });
  const ekManad =
    ekonomi?.serie && ekonomi.serie.length > 0
      ? ekonomi.serie.map((p) => ekPunkt(ekonomiManadKort(p.period), p))
      : ekNetto
      ? [ekPunkt(ekonomiManadEtikett(ekonomi?.period), { diff: m.value_num })]
      : [];
  // Kortets enda datapunkt — styr både siffra, färg och tolkningstext för ekonomi.
  const ekDiff = ekonomi ? m.value_num : null;
  const s = measurementTokens(m.status);
  const fmt = (v: number) => v.toFixed(1).replace(".", ",");

  const klara = activities.filter((a) => a.klar).length;

  // Datumberoende notis beräknas klient-sida efter mount (undviker hydrerings-krock
  // och använder läsarens lokala datum). null = inte uträknat ännu / inte aktuellt.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const ekonomiNotis =
    area.key === "ekonomi" && now ? ekonomiOfullstandig(now) : null;

  // Faktarutan är infälld från start; klick på rubriken viker ut hela texten.
  const [infoOpen, setInfoOpen] = useState(false);

  function scrollToAktiviteter() {
    document.getElementById("aktiviteter")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Lägg-till-aktivitet (höger kolumn).
  const [nyText, setNyText] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function laggTill() {
    const text = nyText.trim();
    if (!text) return;
    setAddBusy(true);
    setFeedback(null);
    try {
      await onAddActivity(text);
      setNyText("");
      setFeedback({ kind: "ok", msg: "Aktivitet tillagd." });
    } catch (e) {
      setFeedback({ kind: "err", msg: e instanceof Error ? e.message : "Något gick fel." });
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <>
      {/* Översikt: huvud + ev. notis/faktaruta + graf. divide-y ger linjer mellan
          blocken utan hängande kant i botten. */}
      <section className="reveal divide-y divide-hairline overflow-hidden rounded-12 border border-hairline bg-background-content">
      {/* Panelhuvud — mjuk statston som tonar ut mot vitt (som prototypen) */}
      <div className={`bg-gradient-to-b to-background-content p-24 md:p-28 ${s.gradient}`}>
        <div className="flex flex-wrap items-start justify-between gap-16">
          <div className="flex items-start gap-14">
            <span className="grid h-48 w-48 shrink-0 place-items-center rounded-12 border border-hairline bg-background-content text-vattjom-text-primary">
              <AreaIcon size={24} strokeWidth={2} aria-hidden="true" />
            </span>
            <div>
              <div className="eyebrow-sm mb-4">
                Område {index + 1} av {total}
              </div>
              <h2 className="font-header text-h4 font-bold leading-tight tracking-tight">
                {area.namn}
              </h2>
              <p className="mt-6 max-w-[448px] text-small leading-snug text-dark-secondary">
                {m.interpretation}
              </p>
            </div>
          </div>

          {/* Färgnivåer (tröskelvärden) — i-ikon med popover, för sjukfrånvaro */}
          {area.key === "sjukfranvaro" && (
            <InfoPopover title="Färgnivåer för sjukfrånvaro" label="Om färgnivåerna">
              <SjukfranvaroNivaer />
            </InfoPopover>
          )}
        </div>

        {/* Nyckeltalsrad — stat-rutor: Utfall (statusfärgad) · Mål · Trend · Aktiviteter.
            Utan trendrutan (ekonomi) blir det tre kolumner i stället för fyra. */}
        <dl className={`mt-24 grid grid-cols-2 gap-12 ${visaTrend ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
          {/* Utfall — statusfärgad headline-ruta */}
          <div className={`rounded-12 border p-16 ${s.soft} ${s.border}`}>
            <dt className={`flex items-center gap-6 font-mono text-[12px] font-semibold uppercase tracking-[0.05em] ${s.text}`}>
              <Gauge size={14} strokeWidth={2.2} aria-hidden="true" />
              {ekonomi ? "Diff budget–prognos" : "Utfall"}
            </dt>
            <dd className={`mt-6 font-header text-h3 font-bold leading-none ${s.text}`}>
              {ekonomi ? diffText(ekDiff) : m.value_text}
            </dd>
          </div>

          {/* Mål — för ekonomi är målet inte ett tal utan ett tillstånd */}
          <div className="rounded-12 border border-hairline bg-background-content p-16">
            <dt className="flex items-center gap-6 font-mono text-[12px] font-semibold uppercase tracking-[0.05em] text-dark-secondary">
              <Target size={14} strokeWidth={2.2} aria-hidden="true" />
              Mål
            </dt>
            <dd className="mt-6 font-header text-h4 font-bold leading-none text-dark-primary">
              {ekonomi ? "Budget i balans" : m.target_text}
            </dd>
          </div>

          {/* Trend — visas inte för ekonomi (se visaTrend) */}
          {visaTrend && (
            <div className="rounded-12 border border-hairline bg-background-content p-16">
              <dt className="flex items-center gap-6 font-mono text-[12px] font-semibold uppercase tracking-[0.05em] text-dark-secondary">
                <LineChart size={14} strokeWidth={2.2} aria-hidden="true" />
                Trend
              </dt>
              <dd className={`mt-6 flex items-center gap-6 text-large font-bold leading-snug ${trendColor}`}>
                {hasTrend && <TrendIcon size={18} strokeWidth={2.4} aria-hidden="true" />}
                <span className={hasTrend ? "" : "text-base font-semibold"}>{m.trend_text}</span>
              </dd>
            </div>
          )}

          {/* Aktiviteter — klickbar: scrollar ner till aktivitetssektionen */}
          <div
            role="button"
            tabIndex={0}
            title="Hoppa till aktiviteter"
            onClick={scrollToAktiviteter}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                scrollToAktiviteter();
              }
            }}
            className="cursor-pointer rounded-12 border border-hairline bg-background-content p-16 text-left transition hover:border-vattjom-surface-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <dt className="flex items-center gap-6 font-mono text-[12px] font-semibold uppercase tracking-[0.05em] text-dark-secondary">
              <ListChecks size={14} strokeWidth={2.2} aria-hidden="true" />
              Aktiviteter
              <ArrowDown size={13} strokeWidth={2.4} className="ml-auto text-vattjom-text-primary" aria-hidden="true" />
            </dt>
            <dd className="mt-6 font-header text-h4 font-bold leading-none text-dark-primary">
              {activities.length === 0 ? (
                "Inga än"
              ) : (
                <>
                  {klara}/{activities.length}{" "}
                  <span className="text-small font-semibold text-dark-secondary">klara</span>
                </>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* Datumberoende notis: ekonomidata är ofullständig tidigt i månaden (1–9, senare i jan) */}
      {ekonomiNotis?.ofullstandig && (
        <div className="bg-warning-background-100 p-24 md:p-28">
          <div className="flex items-start gap-12">
            <span className="mt-2 shrink-0 text-warning-text">
              <TriangleAlert size={18} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-header text-base font-bold tracking-tight text-warning-text">
                Ofullständig data just nu
              </h3>
              <p className="mt-6 max-w-[640px] text-small leading-relaxed text-warning-text">
                Det är den {ekonomiNotis.dag} i månaden. Ekonomidata för föregående månad fylls på
                löpande och är fullständig först {ekonomiNotis.klarText}. Siffrorna nedan kan därför
                vara ofullständiga.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Faktaruta om nyckeltalet — infälld från start, viks ut vid klick på rubriken */}
      {area.info && (
        <div className="bg-vattjom-background-100">
          <button
            type="button"
            aria-expanded={infoOpen}
            aria-controls={`kpi-info-${area.key}`}
            onClick={() => setInfoOpen((o) => !o)}
            className="flex w-full items-center gap-12 p-24 text-left focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring md:p-28"
          >
            <span className="shrink-0 text-vattjom-text-primary">
              <Info size={18} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <h3 className="font-header text-base font-bold tracking-tight">Att tänka på om siffran</h3>
            <ChevronDown
              size={18}
              aria-hidden="true"
              className={`ml-auto shrink-0 text-vattjom-text-primary transition-transform ${infoOpen ? "rotate-180" : ""}`}
            />
          </button>
          {infoOpen && (
            <div id={`kpi-info-${area.key}`} className="px-24 pb-24 md:px-28 md:pb-28">
              <div className="max-w-[640px] space-y-10 pl-[30px] text-small leading-relaxed text-dark-secondary">
                {area.info.split(/\n{2,}/).map((stycke, i) => (
                  <p key={i}>{stycke}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ekonomi (visas bara för ekonomi): klarar vi budgeten om vi fortsätter som nu? */}
      {ekonomi && (
        <div className="bg-background-content p-24 md:p-28">
          <div className="mb-12 flex items-start justify-between gap-8">
            <div className="flex items-center gap-8">
              <BarChart3 size={16} className="text-vattjom-text-primary" aria-hidden="true" />
              <h3 className="font-header text-base font-bold tracking-tight">
                Prognos mot budget
              </h3>
            </div>
            <InfoPopover title="Om diagrammet">
              <p>
                Skillnaden mellan helårsprognosen och helårsbudgeten, i mnkr, månad för månad.
                Den vågräta linjen är budget. En stapel <b>nedåt</b> betyder att prognosen pekar
                mot ett underskott vid årets slut, en stapel <b>uppåt</b> att det finns utrymme kvar.
              </p>
              <p className="text-dark-secondary">
                Varje månad visar den prognos som gällde då, så staplarna berättar om läget
                förbättras eller försämras under året. Månader utan stapel saknar budget
                eller prognos i källan — de fylls på en bit in på året.
              </p>
              {ekManad.some((p) => p.korrigerad) && (
                <p className="text-dark-secondary">
                  Månader märkta med <b>*</b> är manuellt korrigerade. Exporten tas fram till och
                  med den 9:e varje månad och ett senare uttag rör aldrig en tidigare period —
                  lämnas prognosen in efter den 9:e blir den rätt i ekonomisystemet men når
                  aldrig underlaget. Värdet är då satt i samråd med ekonomen.
                </p>
              )}
              {ekonomi.kalla && <p className="text-dark-secondary">Källa: {ekonomi.kalla}</p>}
            </InfoPopover>
          </div>

          {ekManad.some((p) => p.diff !== null) ? (
            <EkonomiDiffChart data={ekManad} />
          ) : (
            <p className="text-small text-dark-secondary">
              Ingen helårsprognos finns för perioden.
            </p>
          )}
        </div>
      )}

      {/* Sjukfrånvaro (visas bara för sjukfrånvaro): total över tid + kön, samt fördelning */}
      {sjuk && (
        <div className="bg-background-content p-24 md:p-28">
          <div className="mb-12 flex items-start justify-between gap-8">
            <div className="flex items-center gap-8">
              <BarChart3 size={16} className="text-vattjom-text-primary" aria-hidden="true" />
              <h3 className="font-header text-base font-bold tracking-tight">
                Total sjukfrånvaro — rullande 12 månader
              </h3>
            </div>
            <InfoPopover title="Om diagrammet" bredd={440}>
              <p>
                Total sjukfrånvaro i % av ordinarie arbetstid (svart linje), med kvinnors och
                mäns nivå. Den gula linjen är målnivån {fmt(SJUK_MAL)} %.
              </p>
              <p>
                <b className="text-dark-primary">Varje punkt är ett helt år.</b> Punkten för en
                månad är snittet av de tolv månader som slutar där — inte månadens eget utfall.
                Kurvan visar alltså inte om december var värre än juli, utan om nivån som helhet
                är på väg upp eller ner.
              </p>
              <p className="text-dark-secondary">
                Det gör serien trög med flit: en enskild månad kan bara flytta värdet en
                tolftedel. En rörelse som syns här är därför sällan en tillfällighet — men den
                syns också senare än i en månadskurva.
              </p>
              {sjukAllaPunkter.length > 0 && (
                <p className="text-dark-secondary">
                  Visar {sjukSerie.length} månadsstängningar
                  {sjukAllaPunkter.length > sjukSerie.length
                    ? ` (av ${sjukAllaPunkter.length} inlästa)`
                    : ""}
                  .
                </p>
              )}
              {sjuk.kalla && <p className="text-dark-secondary">Källa: {sjuk.kalla}</p>}
            </InfoPopover>
          </div>

          {sjukSerie.length > 0 ? (
            <>
              <SjukfranvaroChart data={sjukSerie} mal={SJUK_MAL} />
              {sjukSerie.length < 3 && (
                // En R12-serie säger sitt först när den har några månader att luta sig mot.
                // Säg det rakt ut i stället för att låta två punkter se ut som en trend.
                <p className="mt-8 text-small text-dark-secondary">
                  Serien har bara {sjukSerie.length === 1 ? "en månadsstängning" : "två månadsstängningar"} —
                  för kort för att läsa som en trend. Den fylls på allt eftersom fler
                  månadsuttag importeras.
                </p>
              )}
            </>
          ) : (
            <p className="text-small text-dark-secondary">Ingen sjukfrånvarodata tillgänglig.</p>
          )}

          {/* Estimerad kostnad — översätter procenten till kronor för dialogen. Rutan är
              en fast del av sjukfrånvarokortet: saknas underlag står det varför, i stället
              för att rutan tyst försvinner. */}
          {sjuk && (
            <div className="mt-20 rounded-12 border border-hairline bg-background-200 p-16">
              <div className="flex items-start justify-between gap-8">
                <div className="eyebrow-sm flex items-center gap-6">
                  <Coins size={13} aria-hidden="true" />
                  Estimerad kostnad för sjukfrånvaro
                </div>
                <InfoPopover
                  title="Hur den ekonomiska kostnaden beräknas"
                  label="Hur kostnaden beräknas"
                  bredd={460}
                >
                  <p>
                    Beräkningen bygger på arbetsmiljöekonomisk forskning från Karolinska
                    Institutet (Malin Lohela Karlsson) och SKR:s ekonomiska schabloner för
                    kommunal sektor. Den omfattar allt arbetsgivaren är skyldig att betala
                    enligt lag och kollektivavtal — kostnaden ser olika ut beroende på hur
                    länge frånvaron varar:
                  </p>

                  {[
                    {
                      dagar: "Dag 1–14",
                      niva: "≈ 180 %",
                      av: "av personalkostnaden",
                      rubrik: "Korttidsfrånvaro",
                      text:
                        "Sjuklön med 80 %, arbetsgivaravgifter och försäkrings- och " +
                        "pensionspålägg (PO-pålägg). Därtill vikarie eller övertid för att " +
                        "säkerställa driften.",
                    },
                    {
                      dagar: "Dag 15–90",
                      niva: "10 %",
                      av: "sjuklön enligt avtal",
                      rubrik: "Mellanperioden",
                      text:
                        "Försäkringskassan tar över grundansvaret, men kommunen betalar " +
                        "fortsatt sjuklön enligt kollektivavtalet. Dolda kostnader för " +
                        "rehabmöten, facklig samverkan och chefsadministration tillkommer.",
                    },
                    {
                      dagar: "Dag 91+",
                      niva: "≈ 10 %",
                      av: "av lönekostnaden",
                      rubrik: "Långtidsfrånvaro",
                      text:
                        "Sjuklöneansvaret upphör och ersättning utgår via kollektivavtalad " +
                        "försäkring (Afa). Kvar står produktionstapp, vikarieslitage, " +
                        "rehabiliteringsinsatser och administration.",
                    },
                  ].map((rad) => (
                    <div
                      key={rad.dagar}
                      className="rounded-8 border border-hairline bg-background-200 p-12"
                    >
                      <div className="flex items-baseline justify-between gap-8">
                        <span className="eyebrow-sm">{rad.dagar}</span>
                        <span className="text-right">
                          <b className="font-header text-base text-dark-primary">{rad.niva}</b>{" "}
                          <span className="text-[11px]">{rad.av}</span>
                        </span>
                      </div>
                      <p className="mt-4 font-semibold text-dark-primary">{rad.rubrik}</p>
                      <p className="mt-2">{rad.text}</p>
                    </div>
                  ))}

                  <div className="rounded-8 border border-vattjom-background-100 bg-vattjom-background-100 p-12">
                    <p className="eyebrow-sm text-vattjom-text-primary">Så räknas det här kortet</p>
                    <p className="mt-6 font-mono text-[12px] leading-relaxed text-dark-primary">
                      12 000 000 kr ÷ 8 000 anställda ÷ {fmt(SJUK_MAL)} procentenheter
                      <br />= {KR_PER_ANSTALLD_PE_MANAD} kr per anställd och procentenhet och månad
                      <br />× 12 månader ={" "}
                      <b>{KR_PER_ANSTALLD_PE_AR.toLocaleString("sv-SE")} kr</b> per anställd och
                      procentenhet och <b>år</b>
                    </p>
                    <p className="mt-6">
                      Nyckeltalet är satt för kommunen som helhet: vid målnivån {fmt(SJUK_MAL)} %
                      kostar sjukfrånvaron cirka 12 mnkr per månad — 144 mnkr per år — för omkring 8 000 anställda.{" "}
                      {sjukKost && m.value_num !== null ? (
                        <>
                          För den här förvaltningen räknas det upp med{" "}
                          {sjukKost.anstallda.toLocaleString("sv-SE")} tillsvidareanställda
                          {sjukKost.franData ? (
                            <>
                              {" "}
                              ur samma uttag som sjukfrånvaron
                              {sjukPeriodText ? ` (${sjukPeriodText})` : ""}
                            </>
                          ) : (
                            <> (fast underlag per 2026-04-30 — antalet saknas i importen)</>
                          )}{" "}
                          och förvaltningens faktiska sjukfrånvaro.
                        </>
                      ) : (
                        <>
                          Beräkningen kräver antalet tillsvidareanställda för förvaltningen.
                          Saknas det visas ingen summa.
                        </>
                      )}
                    </p>
                    <p className="mt-6">
                      Kortet visar en <b className="text-dark-primary">uppskattad årskostnad</b>
                      {" "}utifrån R12-nivån och ett personalantal. Personalstyrkan kan ha varierat
                      under året. Schablonen och personalunderlaget gör att beloppet inte är
                      ett uppmätt historiskt kostnadsutfall.
                    </p>
                  </div>

                  <p className="text-[11px] leading-relaxed">
                    Beloppet använder en samlad schablon och delas inte upp på korttids- och
                    långtidsfrånvaro, trots att de kostar olika enligt tabellen ovan. Det är en
                    uppskattning för dialogen, inte en bokförd kostnad.
                  </p>
                </InfoPopover>
              </div>

              {sjukKost && m.value_num !== null ? (
                <>
                  <p className="mt-8 font-header text-h3 font-bold leading-none">
                    {krText(sjukKost.kostnad)}{" "}
                    <span className="font-sans text-base font-semibold text-dark-secondary">
                      per år
                    </span>
                  </p>
                  <p className="mt-8 text-small leading-snug text-dark-secondary">
                    {fmt(m.value_num)} % sjukfrånvaro rullande 12 månader bland{" "}
                    {sjukKost.anstallda.toLocaleString("sv-SE")} tillsvidareanställda.{" "}
                    {/* Jämförelsen mot målnivån är bara meningsfull åt ett håll. Ligger
                        förvaltningen ÖVER målet är målnivån en förbättring att sikta mot.
                        Ligger den UNDER målet vore målnivån en försämring — då säger
                        "vid målnivån hade kostnaden varit X" fel sak. */}
                    {m.value_num > SJUK_MAL ? (
                      <>
                        Vid målnivån {fmt(SJUK_MAL)} % hade kostnaden varit{" "}
                        {krText(sjukKost.vidMal)} —{" "}
                        <span className="font-semibold text-error-text">
                          en merkostnad på {krText(sjukKost.merkostnad)} per år
                        </span>
                        .
                      </>
                    ) : m.value_num < SJUK_MAL ? (
                      <>
                        Det är under målnivån {fmt(SJUK_MAL)} %, vilket motsvarar{" "}
                        <span className="font-semibold text-success-text">
                          {krText(Math.abs(sjukKost.merkostnad))} lägre kostnad per år
                        </span>{" "}
                        än om frånvaron låg på målet.
                      </>
                    ) : (
                      <>Sjukfrånvaron ligger precis på målnivån {fmt(SJUK_MAL)} %.</>
                    )}
                  </p>
                </>
              ) : (
                <p className="mt-8 text-small leading-snug text-dark-secondary">
                  Kan inte beräknas — antalet tillsvidareanställda saknas för förvaltningen.
                </p>
              )}
            </div>
          )}

          {/* Fördelning: långtid + åldersgrupper (kön visas i diagrammet ovan) */}
          {(typeof sjuk.langtidsandel === "number" ||
            (sjuk.aldersgrupper && sjuk.aldersgrupper.length > 0)) && (
            <div className="mt-20 border-t border-hairline pt-16">
              <p className="mb-12 text-small text-dark-secondary">
                Fördelningen nedan är mätt likadant som kurvan: rullande 12 månader fram till{" "}
                {sjukPeriodText || "senaste månadsstängningen"}.
              </p>
              {typeof sjuk.langtidsandel === "number" && (
                <p className="mb-12 text-small text-dark-secondary">
                  Andel långtidssjukfrånvaro (sammanhängande ≥ 60 dagar):{" "}
                  <span className="font-header font-bold text-dark-primary">{fmt(sjuk.langtidsandel)} %</span>
                </p>
              )}
              {sjuk.aldersgrupper && sjuk.aldersgrupper.length > 0 && (
                <>
                  <div className="eyebrow-sm mb-10">Sjukfrånvaro per åldersgrupp</div>
                  <div className="grid gap-x-24 gap-y-12 sm:grid-cols-3">
                    {sjuk.aldersgrupper.map((a) => (
                      <div key={a.grupp}>
                        <div className="mb-4 flex items-baseline justify-between">
                          <span className="text-small text-dark-secondary">{a.grupp}</span>
                          <span className="font-header text-base font-bold tabular-nums">
                            {typeof a.varde === "number" ? `${fmt(a.varde)} %` : "–"}
                          </span>
                        </div>
                        <span className="meter block">
                          <span
                            className="meter-fill block bg-vattjom-surface-primary"
                            style={{ width: `${Math.min(100, ((a.varde ?? 0) / 10) * 100)}%` }}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* HME-nedbrytning (visas bara för HME): totalens årsserie plus delperspektiven,
          som nivåkort med utfällbar graf. */}
      {hme && hme.matningar && (
        <div className="bg-background-content p-24 md:p-28">
          <div className="mb-12 flex items-start justify-between gap-8">
            <div className="flex items-center gap-8">
              <BarChart3 size={16} className="text-vattjom-text-primary" aria-hidden="true" />
              <h3 className="font-header text-base font-bold tracking-tight">
                HME-index — perspektiv och utveckling
              </h3>
            </div>
            {/* Stödtext om nyckeltalet — i en popover bakom i-ikonen (avlastar grafen) */}
            <InfoPopover title="Om HME-index">
              <p>
                Hållbart medarbetarengagemang (HME) mäts som ett index 0–100 per mätår
                {hme.antal_svar ? ` · ${hme.antal_svar} svar i senaste mätningen` : ""}.
              </p>
              <p>
                Talet byggs av tre delperspektiv — motivation, ledarskap och styrning — som
                har egna värden per mätår. Välj nivå ovanför grafen för att se ett perspektiv
                för sig; totalen är det värde kortet visar.
              </p>
              <ul className="space-y-4">
                <li className="flex items-center gap-6">
                  <span className="inline-block h-8 w-8 rounded-full bg-status-good" aria-hidden="true" />
                  Grön punkt = över mål
                </li>
                <li className="flex items-center gap-6">
                  <span className="inline-block h-8 w-8 rounded-full bg-status-alert" aria-hidden="true" />
                  Röd punkt = under mål
                </li>
                <li className="flex items-center gap-6">
                  <span className="inline-block h-0 w-10 border-t-2 border-dashed border-status-warn" aria-hidden="true" />
                  Streckad linje = mål ({m.target_num})
                </li>
              </ul>
            </InfoPopover>
          </div>

          {/* Nivåindelning: Totalt + delperspektiven. Grafen ritas först när en nivå
              valts — se HmeNivaer för varför. */}
          <HmeNivaer
            matningar={hme.matningar}
            perspektiv={hme.perspektiv}
            target={m.target_num}
          />
        </div>
      )}

      </section>

      {/* Egen sektion: aktiviteter — frikopplad från översikten med mellanrum */}
      <section
        id="aktiviteter"
        className="reveal mt-16 scroll-mt-[88px] overflow-hidden rounded-12 border border-hairline bg-background-content"
      >
      <div className="grid lg:grid-cols-2">
        {/* Aktiviteter & åtgärder */}
        <div className="border-hairline p-24 md:p-28 lg:border-r">
          <div className="mb-4 flex items-center gap-10">
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-vattjom-background-100 text-vattjom-text-primary">
              <ListChecks size={18} strokeWidth={2} aria-hidden="true" />
            </span>
            <h3 className="font-header text-base font-bold tracking-tight">Aktiviteter &amp; åtgärder</h3>
            {activities.length > 0 && (
              <span className="ml-auto rounded-full bg-background-200 px-10 py-2 text-small font-semibold tabular-nums text-dark-secondary">
                {klara}/{activities.length} klara
              </span>
            )}
          </div>
          <p className="mb-16 text-small text-dark-secondary">
            Det ni bestämmer i samtalet. Klarrapportera med en kort notering när något är gjort.
          </p>

          {activities.length === 0 ? (
            <div className="flex flex-col items-center gap-8 rounded-12 border border-dashed border-hairline bg-background-200 px-16 py-28 text-center">
              <ListChecks size={22} className="text-dark-secondary" aria-hidden="true" />
              <p className="max-w-[260px] text-small leading-snug text-dark-secondary">
                Inga aktiviteter ännu. Lägg till en till höger så dyker den upp här.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-12">
              {/* Aktiva överst, klarmarkerade under — i skapandeordning inom varje grupp. */}
              {[...activities]
                .sort((a, b) => Number(a.klar) - Number(b.klar) || a.id - b.id)
                .map((a) => (
                  <ActivityRow key={a.id} activity={a} onMarkKlar={onMarkKlar} />
                ))}
            </ul>
          )}
        </div>

        {/* Lägg till aktivitet */}
        <div className="bg-background-200 p-24 md:p-28">
          <div className="mb-4 flex items-center gap-10">
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-background-content text-vattjom-text-primary">
              <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <h3 className="font-header text-base font-bold tracking-tight">Lägg till aktivitet</h3>
          </div>
          <p className="mb-16 text-small text-dark-secondary">
            Skriv en aktivitet eller åtgärd så hamnar den i listan till vänster.
          </p>

          <FormControl className="mb-12 w-full">
            <FormLabel>Aktivitet</FormLabel>
            <Textarea
              className="w-full"
              rows={3}
              value={nyText}
              onChange={(e) => setNyText(e.target.value)}
              maxLength={4000}
              placeholder="t.ex. Ta fram åtgärdsplan tillsammans med controller inför nästa avstämning."
            />
          </FormControl>

          <Button
            color="vattjom"
            variant="primary"
            className="w-full"
            loading={addBusy}
            disabled={addBusy || nyText.trim() === ""}
            onClick={laggTill}
            leftIcon={<Plus size={16} aria-hidden="true" />}
          >
            Lägg till aktivitet
          </Button>

          <p
            role="status"
            aria-live="polite"
            className={`mt-12 min-h-[1.25rem] text-small ${
              feedback?.kind === "err" ? "text-status-alert" : "text-vattjom-text-primary"
            }`}
          >
            {feedback?.msg ?? ""}
          </p>
        </div>
      </div>
      </section>
    </>
  );
}
