"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import { BrandLockup } from "@/components/BrandLockup";
import { UserMenu } from "@/components/UserMenu";
import { TrendingUp, TrendingDown, ChevronLeft, MessagesSquare, ArrowUp } from "lucide-react";
import {
  type DialogueDetail,
  type Activity,
  type ActivityPatch,
  type AreaStatus,
  type Status,
  addAreaStatus,
  createActivity,
  markActivityKlar,
  updateActivity,
  deleteCompletedActivity,
} from "@/lib/api";
import { areaIcon } from "./icons";
import { AREA_DIMENSIONS, STATUS, measurementTokens, kortStatus } from "./status";
import { diffLegend, diffText } from "@/lib/ekonomi";
import { DetailPanel } from "./DetailPanel";
import { SjukUnderlagPanel } from "./SjukUnderlagPanel";
import { QuestionPanel } from "./QuestionPanel";
import { ActivitiesSection } from "./Activities";

// Inga dolda nyckeltal längre. Verksamhet, Digital transformation och Kommunikativt
// ledarskap visas som dialogfråge-kort utan mätdata, med manuellt satt status (§16–17).
const DOLDA_OMRADEN = new Set<string>();

function TillKortenKnapp({ stripRef }: { stripRef: RefObject<HTMLDivElement | null> }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.bottom <= 0),
    );
    observer.observe(strip);
    return () => observer.disconnect();
  }, [stripRef]);

  function visaKorten() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
    document.getElementById("huvudinnehall")?.focus({ preventScroll: true });
  }

  return (
    <button
      type="button"
      onClick={visaKorten}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-24 right-24 z-40 inline-flex items-center gap-8 rounded-full bg-vattjom-surface-primary px-16 py-12 text-small font-semibold text-white shadow-lg transition hover:bg-vattjom-text-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none ${
        visible ? "opacity-100" : "pointer-events-none translate-y-8 opacity-0"
      }`}
    >
      <ArrowUp size={16} strokeWidth={2.4} aria-hidden="true" />
      Visa korten
    </button>
  );
}

export function Dashboard({
  dialogue,
  sessionUser,
}: {
  dialogue: DialogueDetail;
  /** Inloggad användare (saml-läget) — skickas från server-sidan; null döljer menyn. */
  sessionUser?: { name: string; email: string; role: "admin" | "user" } | null;
}) {
  const areas = dialogue.areas.filter((a) => !DOLDA_OMRADEN.has(a.area.key));

  const [selected, setSelected] = useState(areas[0]?.area.key ?? "");
  // Aktiviteter per område, initierat från servern; uppdateras vid lägg-till/klarrapport.
  const [activities, setActivities] = useState<Record<string, Activity[]>>(() =>
    Object.fromEntries(areas.map((a) => [a.area.key, a.activities ?? []])),
  );
  // Manuell status-historik per område (§16), nyast först; initierat från servern.
  const [historik, setHistorik] = useState<Record<string, AreaStatus[]>>(() =>
    Object.fromEntries(areas.map((a) => [a.area.key, a.status_historik ?? []])),
  );

  const selectedIndex = Math.max(
    0,
    areas.findIndex((a) => a.area.key === selected),
  );
  const current = areas[selectedIndex];
  const stripRef = useRef<HTMLDivElement>(null);

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

  async function editActivity(key: string, activityId: number, patch: ActivityPatch) {
    const updated = await updateActivity(activityId, patch);
    setActivities((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).map((a) => (a.id === activityId ? updated : a)),
    }));
  }

  async function deleteActivity(key: string, activityId: number) {
    await deleteCompletedActivity(activityId);
    setActivities((prev) => ({
      ...prev,
      [key]: (prev[key] ?? []).filter((a) => a.id !== activityId),
    }));
  }

  async function sparaStatus(
    key: string,
    areaId: number,
    status: Status,
    kommentar: string,
    dimension: string | null,
  ) {
    const saved = await addAreaStatus(dialogue.id, areaId, status, kommentar, dimension);
    // Lägg nyaste posten först i historiken.
    setHistorik((prev) => ({ ...prev, [key]: [saved, ...(prev[key] ?? [])] }));
  }

  return (
    <>
      {/* ===== Topbar ===== */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-background-content">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-16 px-24 py-16 md:px-32 xl:max-w-[1440px]">
          <BrandLockup />
          <span className="flex items-center gap-16">
            <Link
              href="/"
              className="inline-flex items-center gap-4 truncate rounded-md text-base font-semibold tracking-tight text-dark-secondary transition hover:text-dark-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <ChevronLeft size={16} aria-hidden="true" />
              Alla verksamheter
            </Link>
            {sessionUser && <UserMenu user={sessionUser} />}
          </span>
        </div>
      </header>

      <main
        id="huvudinnehall"
        tabIndex={-1}
        className="mx-auto max-w-[1180px] px-24 pb-[96px] pt-32 outline-hidden md:px-32 md:pt-40 xl:max-w-[1440px]"
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

        {/* Responsiv KPI-strip: 2 kort på mobil, 3 på mellanstora, alla 6 på en rad på
            breda skärmar (xl) — där breddas även containern så korten får rum. */}
        <div ref={stripRef} className="mb-32 grid grid-cols-2 gap-12 md:grid-cols-3 md:gap-16 xl:grid-cols-6">
          {areas.map((item) => {
            const { area, measurement: m } = item;
            const AreaIcon = areaIcon(area.ikon);
            const isSel = area.key === selected;

            // Nyckeltal utan mätdata (§16–17) → dialogfråge-kort med manuellt satt status.
            // Verksamhet har flera dimensioner → kortets färg = värsta av dem.
            if (!m) {
              const effektiv = kortStatus(historik[area.key] ?? [], AREA_DIMENSIONS[area.key] ?? null);
              const st = effektiv ? STATUS[effektiv] : null;
              return (
                <button
                  key={area.key}
                  type="button"
                  aria-pressed={isSel}
                  onClick={() => {
                    setSelected(area.key);
                    scrollToDetail();
                  }}
                  className={`flex flex-col overflow-hidden rounded-12 border text-left transition hover:-translate-y-2 hover:border-dark-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                    st ? st.soft : "bg-background-content"
                  } ${isSel ? "border-vattjom-surface-primary card-selected" : "border-hairline"}`}
                >
                  <span className={`h-4 w-full ${st ? st.solid : "bg-divider"}`} aria-hidden="true" />
                  <span className="flex h-full flex-col gap-16 p-20">
                    {/* Rubrikrad (samma som datakorten) */}
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

                    {/* Status (parallell till datakortens värde-rad → samma höjd) */}
                    <span className="flex items-end justify-between gap-12">
                      <span
                        className={`font-header text-h2 font-bold leading-tight tracking-tight xl:text-h3 ${
                          st ? st.text : "text-dark-secondary"
                        }`}
                      >
                        {st ? st.legend : "Ej satt"}
                      </span>
                    </span>

                    {/* Footer (parallell till mätare-raden) */}
                    <span className="mt-auto flex items-center justify-between gap-8">
                      <span className="eyebrow-sm flex items-center gap-6 text-dark-secondary">
                        <MessagesSquare size={14} strokeWidth={2} aria-hidden="true" />
                        {area.questions.length}{" "}
                        {area.questions.length === 1 ? "dialogfråga" : "dialogfrågor"}
                      </span>
                      {st && (
                        <span className={`eyebrow-sm flex shrink-0 items-center gap-6 ${st.text}`}>
                          <span
                            className={`inline-block h-8 w-8 rounded-full ${st.solid}`}
                            aria-hidden="true"
                          />
                          Manuell status
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              );
            }

            // Ekonomikortet visar EN datapunkt: diff budget–prognos. Ingen trendrad
            // (jämförelsen finns i diagrammet) och ingen mätare (den mäter ackumulerat
            // utfall mot ackumulerad budget — ett annat mått). Samma regel i DetailPanel.
            const ekonomi = m.details?.typ === "ekonomi" ? m.details : null;
            const ekDiff = ekonomi ? m.value_num : null;
            const s = measurementTokens(m.status);
            const visaTrend = !ekonomi;
            const visaMatare = !ekonomi && m.value_num !== null;
            const TrendIcon = m.trend_dir === "up" ? TrendingUp : TrendingDown;
            const fillPct = Math.min(100, ((m.value_num ?? 0) / m.bar_max) * 100);
            const targetPct = Math.min(100, (m.target_num / m.bar_max) * 100);

            return (
              <button
                key={area.key}
                type="button"
                aria-pressed={isSel}
                onClick={() => {
                  setSelected(area.key);
                  scrollToDetail();
                }}
                className={`flex flex-col overflow-hidden rounded-12 border text-left transition hover:-translate-y-2 hover:border-dark-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${s.soft} ${
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

                  {/* Värdet på egen rad (får hela bredden → radbryts inte), förändringen under. */}
                  <span className="block">
                    <span className="block font-header text-h1 font-bold leading-none tracking-tight xl:text-h3 xl:leading-tight">
                      {ekonomi ? diffText(ekDiff) : m.value_text}
                    </span>
                    {ekonomi && (
                      <span className="mt-6 block text-small text-dark-secondary">
                        Diff budget–prognos
                      </span>
                    )}
                    {visaTrend && (
                      <span
                        className={`mt-6 flex items-center gap-6 text-small font-semibold ${
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
                    )}
                  </span>

                  {/* Mätare + mål. Ekonomi saknar mätare — målet är ett tillstånd,
                      inte ett tal att fylla upp mot. */}
                  <span className="mt-auto block">
                    {visaMatare && (
                      <span className="meter block">
                        <span className={`meter-fill block ${s.solid}`} style={{ width: `${fillPct}%` }} />
                        <span className="meter-target" style={{ left: `calc(${targetPct}% - 1px)` }} />
                      </span>
                    )}
                    <span className="eyebrow-sm mt-8 flex items-center justify-between gap-8">
                      <span className="truncate">
                        {ekonomi
                          ? "Mål Budget i balans"
                          : area.lower_better
                          ? `Lägre = bättre · Mål ${m.target_text}`
                          : `Mål ${m.target_text}`}
                      </span>
                      <span className={`flex shrink-0 items-center gap-6 ${s.text}`}>
                        <span className={`inline-block h-8 w-8 rounded-full ${s.solid}`} aria-hidden="true" />
                        {ekonomi ? diffLegend(ekDiff) : s.legend}
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
          {current && <SjukUnderlagPanel item={current} />}
          {current &&
            (current.measurement ? (
              <DetailPanel
                key={current.area.key}
                item={current}
                index={selectedIndex}
                total={areas.length}
                activities={activities[current.area.key] ?? []}
              />
            ) : (
              <QuestionPanel
                key={current.area.key}
                item={current}
                index={selectedIndex}
                total={areas.length}
                historik={historik[current.area.key] ?? []}
                dimensions={AREA_DIMENSIONS[current.area.key] ?? null}
                onSaveStatus={(status, kommentar, dimension) =>
                  sparaStatus(current.area.key, current.area.id, status, kommentar, dimension)
                }
              />
            ))}
          {current && (
            <ActivitiesSection
              key={current.area.key}
              activities={activities[current.area.key] ?? []}
              onAddActivity={(text) => addActivity(current.area.key, current.area.id, text)}
              onMarkKlar={(activityId, notering) => markKlar(current.area.key, activityId, notering)}
              onEditActivity={(activityId, patch) => editActivity(current.area.key, activityId, patch)}
              onDeleteActivity={(activityId) => deleteActivity(current.area.key, activityId)}
            />
          )}
        </div>
        <TillKortenKnapp stripRef={stripRef} />
      </main>
    </>
  );
}
