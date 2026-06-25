"use client";

import { useEffect, useState } from "react";
import { Button, FormControl, FormLabel, Input, Textarea } from "@sk-web-gui/react";
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
} from "lucide-react";
import type { Activity, DialogueArea } from "@/lib/api";
import { areaIcon } from "./icons";
import { STATUS } from "./status";
import { HmeLineChart } from "./charts/HmeLineChart";
import { InfoPopover } from "./InfoPopover";

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
  onAddActivity,
  onMarkKlar,
}: {
  item: DialogueArea;
  index: number;
  total: number;
  activities: Activity[];
  onAddActivity: (text: string) => Promise<void>;
  onMarkKlar: (activityId: number, notering: string) => Promise<void>;
}) {
  const { area, measurement: m } = item;
  const s = STATUS[m.status];
  const AreaIcon = areaIcon(area.ikon);
  // Trend kan saknas (ingen jämförelseperiod) → neutral platshållare utan riktningspil.
  const hasTrend = m.trend_dir !== null;
  const TrendIcon = !hasTrend ? Minus : m.trend_dir === "up" ? TrendingUp : TrendingDown;
  const trendColor = !hasTrend
    ? "text-dark-secondary"
    : m.trend_good
    ? "text-status-good"
    : "text-status-alert";

  const hme = m.details?.typ === "hme" ? m.details : null;
  const dims = [
    ["motivation", "Motivation"],
    ["styrning", "Styrning"],
    ["ledarskap", "Ledarskap"],
  ] as const;
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
        </div>

        {/* Nyckeltalsrad — stat-rutor: Utfall (statusfärgad) · Mål · Trend · Aktiviteter */}
        <dl className="mt-24 grid grid-cols-2 gap-12 sm:grid-cols-4">
          {/* Utfall — statusfärgad headline-ruta */}
          <div className={`rounded-12 border p-16 ${s.soft} ${s.border}`}>
            <dt className={`flex items-center gap-6 font-mono text-[12px] font-semibold uppercase tracking-[0.05em] ${s.text}`}>
              <Gauge size={14} strokeWidth={2.2} aria-hidden="true" />
              Utfall
            </dt>
            <dd className={`mt-6 font-header text-h3 font-bold leading-none ${s.text}`}>
              {m.value_text}
            </dd>
          </div>

          {/* Mål */}
          <div className="rounded-12 border border-hairline bg-background-content p-16">
            <dt className="flex items-center gap-6 font-mono text-[12px] font-semibold uppercase tracking-[0.05em] text-dark-secondary">
              <Target size={14} strokeWidth={2.2} aria-hidden="true" />
              Mål
            </dt>
            <dd className="mt-6 font-header text-h4 font-bold leading-none text-dark-primary">
              {m.target_text}
            </dd>
          </div>

          {/* Trend */}
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
              <p className="max-w-[640px] pl-[30px] text-small leading-relaxed text-dark-secondary">
                {area.info}
              </p>
            </div>
          )}
        </div>
      )}

      {/* HME-nedbrytning (visas bara för HME): historik (officiella rapporten) och/eller
          delindex + chef/medarbetare (rådata). Renderas villkorat per tillgängliga fält. */}
      {hme && (hme.matningar || hme.delindex) && (
        <div className="bg-background-content p-24 md:p-28">
          <div className="mb-12 flex items-start justify-between gap-8">
            <div className="flex items-center gap-8">
              <BarChart3 size={16} className="text-vattjom-text-primary" aria-hidden="true" />
              <h3 className="font-header text-base font-bold tracking-tight">
                HME-index — utveckling över tid
              </h3>
            </div>
            {/* Stödtext om nyckeltalet — i en popover bakom i-ikonen (avlastar grafen) */}
            <InfoPopover title="Om HME-index">
              <p>
                Hållbart medarbetarengagemang (HME) mäts som ett index 0–100 per mätår
                {hme.antal_svar ? ` · ${hme.antal_svar} svar i senaste mätningen` : ""}.
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

          {/* Historik (officiella rapporten) */}
          {hme.matningar && (
            <HmeLineChart
              data={Object.keys(hme.matningar)
                .sort()
                .map((ar) => ({ ar, value: hme.matningar![ar] }))}
              target={m.target_num}
            />
          )}

          {/* Delindex (rådata) */}
          {hme.delindex && (
            <div className="mt-16">
              <p className="mb-12 text-small text-dark-secondary">
                Delindex 0–100 per dimension
                {hme.n ? ` (bygger på ${hme.n} svar)` : ""}.
              </p>
              <div className="grid gap-x-24 gap-y-12 sm:grid-cols-3">
                {dims.map(([key, label]) => (
                  <div key={key}>
                    <div className="mb-4 flex items-baseline justify-between">
                      <span className="text-small text-dark-secondary">{label}</span>
                      <span className="font-header text-base font-bold tabular-nums">{fmt(hme.delindex![key])}</span>
                    </div>
                    <span className="meter block">
                      <span
                        className="meter-fill block bg-vattjom-surface-primary"
                        style={{ width: `${hme.delindex![key]}%` }}
                      />
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-20">
                <div className="eyebrow-sm mb-10">Chef jämfört med medarbetare</div>
                {hme.segment ? (
                  <div className="grid grid-cols-2 gap-12">
                    {(["chef", "medarbetare"] as const).map((seg) => (
                      <div key={seg} className="rounded-12 border border-hairline bg-background-200 p-16">
                        <div className="eyebrow-sm mb-4">
                          {seg === "chef" ? "Chefer" : "Medarbetare"} · n={hme.segment![seg].n}
                        </div>
                        <div className="font-header text-h4 font-bold leading-none">
                          {fmt(hme.segment![seg].hme_total)}
                        </div>
                        <dl className="mt-10 space-y-4 text-small text-dark-secondary">
                          {dims.map(([key, label]) => (
                            <div key={key} className="flex justify-between gap-8">
                              <dt>{label}</dt>
                              <dd className="tabular-nums">{fmt(hme.segment![seg].delindex[key])}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-small text-dark-secondary">
                    Uppdelning på chef och medarbetare visas inte här – underlaget är för litet för att
                    skydda enskilda svar.
                  </p>
                )}
              </div>
            </div>
          )}
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
