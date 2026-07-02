"use client";

import { useState } from "react";
import Link from "next/link";
import { BrandLockup } from "@/components/BrandLockup";
import { TrendingUp, TrendingDown, ChevronLeft, MessagesSquare } from "lucide-react";
import {
  type DialogueDetail,
  type Activity,
  type AreaStatus,
  type Status,
  createActivity,
  markActivityKlar,
  setAreaStatus,
} from "@/lib/api";
import { areaIcon } from "./icons";
import { STATUS } from "./status";
import { DetailPanel } from "./DetailPanel";
import { QuestionPanel } from "./QuestionPanel";

// Inga dolda nyckeltal längre. Verksamhet, Digital transformation och Kommunikativt
// ledarskap visas som dialogfråge-kort utan mätdata, med manuellt satt status (§16–17).
const DOLDA_OMRADEN = new Set<string>();

export function Dashboard({ dialogue }: { dialogue: DialogueDetail }) {
  const areas = dialogue.areas.filter((a) => !DOLDA_OMRADEN.has(a.area.key));

  const [selected, setSelected] = useState(areas[0]?.area.key ?? "");
  // Aktiviteter per område, initierat från servern; uppdateras vid lägg-till/klarrapport.
  const [activities, setActivities] = useState<Record<string, Activity[]>>(() =>
    Object.fromEntries(areas.map((a) => [a.area.key, a.activities ?? []])),
  );
  // Manuellt satt status per område (§16), initierat från servern; uppdateras vid spara.
  const [manuellStatus, setManuellStatus] = useState<Record<string, AreaStatus | null>>(() =>
    Object.fromEntries(areas.map((a) => [a.area.key, a.manuell_status])),
  );

  const selectedIndex = Math.max(
    0,
    areas.findIndex((a) => a.area.key === selected),
  );
  const current = areas[selectedIndex];

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

  async function sparaStatus(key: string, areaId: number, status: Status, kommentar: string) {
    const saved = await setAreaStatus(dialogue.id, areaId, status, kommentar);
    setManuellStatus((prev) => ({ ...prev, [key]: saved }));
  }

  return (
    <>
      {/* ===== Topbar ===== */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-background-content">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-16 px-24 py-16 md:px-32">
          <BrandLockup />
          <Link
            href="/"
            className="inline-flex items-center gap-4 truncate rounded-md text-base font-semibold tracking-tight text-dark-secondary transition hover:text-dark-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Alla förvaltningar
          </Link>
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
          </div>
        </div>

        {/* ===== KPI-strip: statuslegend (rubrik borttagen — sektioner saknar rubriker) ===== */}
        <div className="mb-12 flex items-end justify-end gap-12">
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
            const AreaIcon = areaIcon(area.ikon);
            const isSel = area.key === selected;

            // Nyckeltal utan mätdata (§16–17) → dialogfråge-kort med manuellt satt status.
            if (!m) {
              const ms = manuellStatus[area.key];
              const st = ms ? STATUS[ms.status] : null;
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
                  className={`flex flex-col overflow-hidden rounded-12 border text-left transition hover:-translate-y-2 hover:border-dark-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    st ? st.soft : "bg-background-content"
                  } ${isSel ? "border-vattjom-surface-primary card-selected" : "border-hairline"}`}
                >
                  <span className={`h-4 w-full ${st ? st.solid : "bg-divider"}`} aria-hidden="true" />
                  <span className="flex h-full flex-col gap-16 p-20">
                    <span className="flex items-center gap-10">
                      <span
                        className={`icon-chip grid h-40 w-40 shrink-0 place-items-center rounded-12 bg-background-content ${
                          st ? st.solidText : "text-vattjom-text-primary"
                        }`}
                      >
                        <AreaIcon size={20} strokeWidth={2} aria-hidden="true" />
                      </span>
                      <span className="text-base font-semibold leading-tight tracking-tight">
                        {area.short ? `${area.namn} (${area.short})` : area.namn}
                      </span>
                    </span>
                    <span className="mt-auto flex items-center justify-between gap-8">
                      <span className="flex items-center gap-8 text-small text-dark-secondary">
                        <MessagesSquare
                          size={16}
                          strokeWidth={2}
                          aria-hidden="true"
                          className="text-vattjom-text-primary"
                        />
                        {area.questions.length}{" "}
                        {area.questions.length === 1 ? "fråga" : "frågor"}
                      </span>
                      {st ? (
                        <span className={`eyebrow-sm flex shrink-0 items-center gap-6 ${st.text}`}>
                          <span
                            className={`inline-block h-8 w-8 rounded-full ${st.solid}`}
                            aria-hidden="true"
                          />
                          {st.legend}
                        </span>
                      ) : (
                        <span className="eyebrow-sm shrink-0 text-dark-secondary">Ingen status</span>
                      )}
                    </span>
                  </span>
                </button>
              );
            }

            const s = STATUS[m.status];
            const TrendIcon = m.trend_dir === "up" ? TrendingUp : TrendingDown;
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
          {current &&
            (current.measurement ? (
              <DetailPanel
                key={current.area.key}
                item={current}
                index={selectedIndex}
                total={areas.length}
                activities={activities[current.area.key] ?? []}
                onAddActivity={(text) => addActivity(current.area.key, current.area.id, text)}
                onMarkKlar={(activityId, notering) => markKlar(current.area.key, activityId, notering)}
              />
            ) : (
              <QuestionPanel
                key={current.area.key}
                item={current}
                index={selectedIndex}
                total={areas.length}
                manuellStatus={manuellStatus[current.area.key] ?? null}
                onSaveStatus={(status, kommentar) =>
                  sparaStatus(current.area.key, current.area.id, status, kommentar)
                }
              />
            ))}
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
