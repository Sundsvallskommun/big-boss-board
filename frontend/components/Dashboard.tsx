"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Logo } from "@sk-web-gui/react";
import { TrendingUp, TrendingDown, ChevronLeft } from "lucide-react";
import {
  type DialogueDetail,
  type Activity,
  type Status,
  createActivity,
  markActivityKlar,
} from "@/lib/api";
import { areaIcon } from "./icons";
import { STATUS } from "./status";
import { StatusFordelning } from "./StatusFordelning";
import { DetailPanel } from "./DetailPanel";

// Tillfälligt dolda nyckeltal i denna version (ta bort ur setet för att visa igen).
const DOLDA_OMRADEN = new Set(["verksamhet", "digital"]);

export function Dashboard({ dialogue }: { dialogue: DialogueDetail }) {
  const areas = dialogue.areas.filter((a) => !DOLDA_OMRADEN.has(a.area.key));

  const [selected, setSelected] = useState(areas[0]?.area.key ?? "");
  // Aktiviteter per område, initierat från servern; uppdateras vid lägg-till/klarrapport.
  const [activities, setActivities] = useState<Record<string, Activity[]>>(() =>
    Object.fromEntries(areas.map((a) => [a.area.key, a.activities ?? []])),
  );

  // Sammanvägd status: good=1, warn=0.5, alert=0. Styr etiketten.
  const score = useMemo(() => {
    if (areas.length === 0) return 0;
    const w = { good: 1, warn: 0.5, alert: 0 } as const;
    return areas.reduce((sum, a) => sum + w[a.measurement.status], 0) / areas.length;
  }, [areas]);

  // Antal nyckeltal per status — driver fördelningsstapeln.
  const counts = useMemo(() => {
    const c: Record<Status, number> = { good: 0, warn: 0, alert: 0 };
    for (const a of areas) c[a.measurement.status]++;
    return c;
  }, [areas]);

  const selectedIndex = Math.max(
    0,
    areas.findIndex((a) => a.area.key === selected),
  );
  const current = areas[selectedIndex];

  const gaugeLabel =
    score >= 0.75 ? "I mål" : score >= 0.4 ? "Delvis i mål" : "Under mål";

  function scrollToDetail() {
    document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function addActivity(key: string, areaId: number, text: string) {
    const created = await createActivity(dialogue.id, areaId, text);
    setActivities((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), created] }));
  }

  async function markKlar(key: string, activityId: number, notering: string) {
    const updated = await markActivityKlar(activityId, notering);
    setActivities((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).map((a) => (a.id === activityId ? updated : a)),
    }));
  }

  return (
    <>
      {/* ===== Topbar ===== */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-background-content">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-16 px-24 py-16 md:px-32">
          <div className="flex min-w-0 items-center gap-14">
            {/* SK-logon är liggande (viewBox 164×72); .sk-logo-figure defaultas
                stående och squashar den. Sätt rätt proportion (~48px hög). */}
            <Link
              href="/"
              aria-label="Till startsidan"
              className="flex items-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_.sk-logo-figure]:!h-[48px] [&_.sk-logo-figure]:!w-[109px]"
            >
              <Logo variant="logo" />
            </Link>
            <span className="h-36 w-px shrink-0 bg-divider" aria-hidden="true" />
            <Link
              href="/"
              className="inline-flex items-center gap-4 truncate rounded-md text-base font-semibold tracking-tight text-dark-secondary transition hover:text-dark-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              Alla förvaltningar
            </Link>
          </div>
          <div className="flex items-center gap-12">
            <div
              role="img"
              aria-label={`Ansvarig chef: ${dialogue.ansvarig_chef.namn}`}
              className="grid h-40 w-40 place-items-center rounded-full bg-vattjom-surface-primary text-small font-semibold text-white"
            >
              {dialogue.ansvarig_chef.initialer}
            </div>
          </div>
        </div>
      </header>

      <main
        id="huvudinnehall"
        tabIndex={-1}
        className="mx-auto max-w-[1180px] px-24 pb-[96px] pt-32 outline-none md:px-32 md:pt-40"
      >
        {/* ===== Rubrik + kontext ===== */}
        <div className="mb-32 flex flex-wrap items-end justify-between gap-x-32 gap-y-16">
          <div>
            <div className="eyebrow mb-8">Uppföljningsdialog · chef &amp; chef</div>
            <h1 className="font-header text-h1 font-bold leading-tight tracking-tight">
              Samlad bild för <span className="text-vattjom-text-primary">dialog</span>
            </h1>
            <p className="mt-8 max-w-[576px] text-base leading-relaxed text-dark-secondary">
              Gå igenom nyckeltalen och fånga aktiviteter och åtgärder direkt i samtalet — hoppa
              fritt mellan områdena.
            </p>
          </div>
          <div className="flex items-center gap-16 rounded-12 border border-hairline bg-background-content px-16 py-12">
            <div>
              <div className="eyebrow-sm">Verksamhet</div>
              <div className="mt-2 text-base font-semibold leading-tight">
                {dialogue.organisation.namn}
              </div>
              <div className="text-small leading-tight text-dark-secondary">Sundsvalls kommun</div>
            </div>
            <span className="h-36 w-px bg-divider" aria-hidden="true" />
            <div>
              <div className="eyebrow-sm">Ansvarig chef</div>
              <div className="mt-2 text-base font-semibold leading-tight">
                {dialogue.ansvarig_chef.namn}
              </div>
              <div className="text-small leading-tight text-dark-secondary">{dialogue.period}</div>
            </div>
          </div>
        </div>

        {/* ===== Norra stjärnan ===== */}
        <section className="mb-32 overflow-hidden rounded-12 border border-hairline bg-background-content">
          <div className="grid items-center gap-24 p-24 md:grid-cols-[1fr_auto] md:p-28">
            <div className="space-y-16">
              <div className="flex items-baseline gap-12">
                <span className="eyebrow w-[68px] shrink-0">Effekt</span>
                <p className="text-[19px] font-semibold leading-snug tracking-[-0.015em] md:text-[21px]">
                  Sundsvalls kommun uppnår <span className="text-vattjom-text-primary">samtliga uppdrag</span>
                </p>
              </div>
              <div className="h-px bg-hairline" />
              <div className="flex items-baseline gap-12">
                <span className="eyebrow w-[68px] shrink-0">Resultat</span>
                <p className="text-[19px] font-semibold leading-snug tracking-[-0.015em] md:text-[21px]">
                  Chefer säkrar resultat och måluppfyllelse
                </p>
              </div>
            </div>
            <StatusFordelning counts={counts} total={areas.length} label={gaugeLabel} />
          </div>
        </section>

        {/* ===== KPI-strip ===== */}
        <div className="mb-12 flex items-end justify-between gap-12">
          <div>
            <h2 className="font-header text-h3 font-bold tracking-tight">Ansvarsområden</h2>
            <p className="mt-2 text-small text-dark-secondary">
              Välj ett område för att öppna dialogen.
            </p>
          </div>
          <div className="hidden items-center gap-16 pb-4 md:flex">
            {(["good", "warn", "alert"] as const).map((st) => (
              <span key={st} className="eyebrow-sm flex items-center gap-6">
                <span className={`inline-block h-10 w-10 rounded-full ${STATUS[st].solid}`} />
                {STATUS[st].legend}
              </span>
            ))}
          </div>
        </div>

        {areas.length === 0 && (
          <p className="mb-32 rounded-12 border border-hairline bg-background-content p-64 text-base text-dark-secondary">
            Det finns inga ansvarsområden att visa för den här dialogen ännu.
          </p>
        )}

        <div
          className="mb-32 grid gap-16"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}
        >
          {areas.map((item) => {
            const { area, measurement: m } = item;
            const s = STATUS[m.status];
            const AreaIcon = areaIcon(area.ikon);
            const TrendIcon = m.trend_dir === "up" ? TrendingUp : TrendingDown;
            const isSel = area.key === selected;
            const fillPct = Math.min(100, (m.value_num / m.bar_max) * 100);
            const targetPct = Math.min(100, (m.target_num / m.bar_max) * 100);

            return (
              <button
                key={area.key}
                type="button"
                aria-selected={isSel}
                aria-pressed={isSel}
                onClick={() => {
                  setSelected(area.key);
                  scrollToDetail();
                }}
                className={`flex flex-col overflow-hidden rounded-12 border text-left transition hover:-translate-y-2 hover:border-dark-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${s.soft} ${
                  isSel ? "border-vattjom-surface-primary card-selected" : "border-hairline"
                }`}
              >
                <span className={`h-4 w-full ${s.solid}`} aria-hidden="true" />
                <span className="flex h-full flex-col gap-16 p-20">
                  {/* Rubrikrad: ikon + namn (får plats på bredden, bryts vid behov) */}
                  <span className="flex items-center gap-10">
                    <span className={`icon-chip grid h-40 w-40 shrink-0 place-items-center rounded-12 bg-background-content ${s.solidText}`}>
                      <AreaIcon size={20} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <span className="text-base font-semibold leading-tight tracking-tight">
                      {area.short ? `${area.namn} (${area.short})` : area.namn}
                    </span>
                  </span>

                  {/* Värde + trend */}
                  <span className="flex items-end justify-between gap-12">
                    <span className="font-header text-h1 font-bold leading-none tracking-tight">
                      {m.value_text}
                    </span>
                    <span
                      className={`flex items-center gap-6 pb-1 text-small font-semibold ${
                        m.trend_dir === null
                          ? "text-dark-secondary"
                          : m.trend_good
                          ? "text-status-good"
                          : "text-status-alert"
                      }`}
                    >
                      {m.trend_dir && (
                        <TrendIcon size={16} strokeWidth={2.4} aria-hidden="true" />
                      )}
                      <span className="truncate">{m.trend_text}</span>
                    </span>
                  </span>

                  {/* Mätare + mål */}
                  <span className="mt-auto block">
                    <span className="meter block">
                      <span className={`meter-fill block ${s.solid}`} style={{ width: `${fillPct}%` }} />
                      <span className="meter-target" style={{ left: `calc(${targetPct}% - 1px)` }} />
                    </span>
                    <span className="eyebrow-sm mt-8 flex items-center justify-between gap-8">
                      <span className="truncate">
                        {area.lower_better ? `Lägre = bättre · Mål ${m.target_text}` : `Mål ${m.target_text}`}
                      </span>
                      <span className={`flex shrink-0 items-center gap-6 ${s.text}`}>
                        <span className={`inline-block h-8 w-8 rounded-full ${s.solid}`} aria-hidden="true" />
                        {s.legend}
                      </span>
                    </span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* ===== Dialogpanel ===== */}
        <div id="detail">
          {current && (
            <DetailPanel
              key={current.area.key}
              item={current}
              index={selectedIndex}
              total={areas.length}
              activities={activities[current.area.key] ?? []}
              onAddActivity={(text) => addActivity(current.area.key, current.area.id, text)}
              onMarkKlar={(activityId, notering) => markKlar(current.area.key, activityId, notering)}
            />
          )}
        </div>

        <footer className="mt-40 text-center">
          <p className="eyebrow-sm opacity-70">
            Använd endast öppen och publik information i dialogen. All data i tjänsten är fiktiv.
          </p>
        </footer>
      </main>
    </>
  );
}
