"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  TriangleAlert,
  BarChart3,
  ListChecks,
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

/** Månadsstängning → "jul" eller "jul 26" för sjukfrånvarons R12-axel.
 *
 *  Tolv rullande månader spänner alltid över ett årsskifte, så året måste framgå någonstans
 *  — men inte på varje tick: tolv etiketter à "aug 25" ryms inte i panelen på en telefon.
 *  Året sätts därför ut på seriens första punkt och på varje januari, som är precis där
 *  det byter. */
function manadKort(iso: string | undefined, medAr: boolean): string {
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

export function DetailPanel({
  item,
  index,
  total,
  activities,
}: {
  item: DialogueArea;
  index: number;
  total: number;
  activities: Activity[];
}) {
  const { area } = item;
  // DetailPanel renderas bara för nyckeltal MED mätdata (Dashboard väljer QuestionPanel
  // för dem utan) — assertion är därför säker och håller typerna nöjda.
  const m = item.measurement!;
  const AreaIcon = areaIcon(area.ikon);
  // Ekonomins förändring visas i prognosdiagrammet, utan separat trendruta.
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
  // perioden. Saknas antalet kan kostnaden inte beräknas.
  const sjukKost = sjuk ? sjukKostnad(m.value_num, sjuk.anstallda) : null;
  // Perioden i löpande text ("juli 2026") — används där rutan ska säga vilket uttag
  // underlaget kommer ur.
  const sjukPeriodText = sjuk ? sjukManadLang(sjuk.period) : "";
  // Diagrammet visar det senaste årets månadsstängningar. Serien kan vara längre än så
  // (importen sparar allt som lästs in) — men tolv punkter är ett år, och äldre punkter
  // skulle bara komprimera x-axeln utan att tillföra något i samtalet.
  const sjukAllaPunkter = sjuk?.serie ?? [];
  const sjukSerie = sjukAllaPunkter.slice(-12).map((p, i) => ({
    period: manadKort(p.period, i === 0 || p.period.slice(5, 7) === "01"),
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
      ? ekonomi.serie.map((p, i) => ekPunkt(manadKort(p.period, i === 0 || p.period.slice(5, 7) === "01"), p))
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

  return (
    <>
      {/* Översikt: huvud + ev. notis/faktaruta + graf. divide-y ger linjer mellan
          blocken utan hängande kant i botten. */}
      <section className="reveal divide-y divide-hairline overflow-hidden rounded-12 border border-hairline bg-background-content">
      {/* Panelhuvud — mjuk statston som tonar ut mot vitt (som prototypen) */}
      <div className={`bg-linear-to-b to-background-content p-24 md:p-28 ${s.gradient}`}>
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
            className="cursor-pointer rounded-12 border border-hairline bg-background-content p-16 text-left transition hover:border-vattjom-surface-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
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
            className="flex w-full items-center gap-12 p-24 text-left focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring md:p-28"
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
                mäns nivå. Den grå streckade linjen är målnivån {fmt(SJUK_MAL)} %.
              </p>
              <p>
                <b className="text-dark-primary">Varje punkt är ett helt år.</b> Punkten för en
                månad sammanfattar de tolv månader som slutar där — inte månadens eget utfall.
                Kurvan visar alltså inte om december var värre än juli, utan om nivån som helhet
                är på väg upp eller ner.
              </p>
              <p className="text-dark-secondary">
                Rullande 12 månader jämnar ut kortsiktiga variationer. Förändringar kan därför
                synas senare än i en månadskurva. Bedöm utvecklingen tillsammans med
                verksamhetens övriga underlag.
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
                    Uppskattad årskostnad = antal tillsvidareanställda × sjukfrånvaro i
                    procent × {KR_PER_ANSTALLD_PE_AR.toLocaleString("sv-SE")} kr.
                    Schablonen motsvarar {KR_PER_ANSTALLD_PE_MANAD} kr per anställd,
                    procentenhet och månad.
                  </p>
                  <p>
                    Modellen utgår från antagandet 12 mnkr per månad vid 6 % sjukfrånvaro
                    och 8 000 anställda. Den beräknar inte faktiska löner, sjuklön,
                    vikariekostnader eller kostnader för enskilda sjukfall.
                  </p>
                  <p>
                    Personalantalet är en ögonblicksbild och kan ha varierat under året.
                    Beloppet är ett samtalsunderlag, inte en bokförd kostnad eller en
                    säker besparing vid lägre sjukfrånvaro.
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
                  <p className="mt-8 text-small text-dark-secondary">
                    Personalunderlag: {sjukPeriodText || "samma uttag som sjukfrånvaron"}.
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

    </>
  );
}
