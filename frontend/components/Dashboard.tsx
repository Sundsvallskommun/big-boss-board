"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Logo } from "@sk-web-gui/react";
import { TrendingUp, TrendingDown, Check, ChevronLeft } from "lucide-react";
import {
  type DialogueDetail,
  type AgreementInput,
  upsertAgreement,
  patchAreaReview,
} from "@/lib/api";
import { areaIcon } from "./icons";
import { STATUS } from "./status";
import { Gauge } from "./Gauge";
import { DetailPanel, type Note } from "./DetailPanel";

export function Dashboard({ dialogue }: { dialogue: DialogueDetail }) {
  const areas = dialogue.areas;

  // Lokalt dialogtillstånd, initierat från seedad data. Persistens kopplas på i Fas 3.
  const [selected, setSelected] = useState(areas[0]?.area.key ?? "");
  const [notes, setNotes] = useState<Record<string, Note>>(() =>
    Object.fromEntries(
      areas.map((a) => [
        a.area.key,
        {
          text: a.agreement?.text ?? "",
          owner: a.agreement?.ansvarig ?? "",
          date: a.agreement?.klart_senast ?? "",
        },
      ]),
    ),
  );
  const [done, setDone] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(areas.map((a) => [a.area.key, a.agreement?.genomgangen ?? false])),
  );

  const doneCount = useMemo(
    () => areas.filter((a) => done[a.area.key]).length,
    [areas, done],
  );
  // Sammanvägd status: good=1, warn=0.5, alert=0. Styr mätarens nål och etikett.
  const score = useMemo(() => {
    if (areas.length === 0) return 0;
    const w = { good: 1, warn: 0.5, alert: 0 } as const;
    return areas.reduce((sum, a) => sum + w[a.measurement.status], 0) / areas.length;
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

  function noteToInput(key: string): AgreementInput {
    const n = notes[key];
    return { text: n.text, ansvarig: n.owner, klart_senast: n.date || null };
  }

  // Spara ev. ändrad anteckning först (så den inte tappas), växla sedan genomgången.
  async function toggleArea(key: string, areaId: number) {
    await upsertAgreement(dialogue.id, areaId, noteToInput(key));
    const next = !done[key];
    await patchAreaReview(dialogue.id, areaId, next);
    setDone((prev) => ({ ...prev, [key]: next }));
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
            <div className="hidden items-center gap-10 rounded-full border border-hairline px-12 py-6 sm:flex">
              <span className="eyebrow-sm">
                {doneCount} av {areas.length} genomgångna
              </span>
              <span className="flex items-center gap-4" aria-hidden="true">
                {areas.map((a) => (
                  <span
                    key={a.area.key}
                    className={`inline-block h-8 w-8 rounded-full ${
                      done[a.area.key] ? "bg-vattjom-surface-primary" : "bg-divider"
                    }`}
                  />
                ))}
              </span>
            </div>
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
              Gå igenom nyckeltalen tillsammans, ett område i taget. Fånga vad ni kommer överens om
              direkt i samtalet.
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
              <div className="flex items-start gap-12">
                <span className="eyebrow w-[68px] shrink-0 pt-6">Effekt</span>
                <p className="text-[19px] font-semibold leading-snug tracking-[-0.015em] md:text-[21px]">
                  Sundsvalls kommun uppnår <span className="text-vattjom-text-primary">samtliga uppdrag</span>
                </p>
              </div>
              <div className="h-px bg-hairline" />
              <div className="flex items-start gap-12">
                <span className="eyebrow w-[68px] shrink-0 pt-6">Resultat</span>
                <p className="text-[19px] font-semibold leading-snug tracking-[-0.015em] md:text-[21px]">
                  Chefer säkrar resultat och måluppfyllelse
                </p>
              </div>
            </div>
            <Gauge level={score} label={gaugeLabel} hint="Flera områden kräver åtgärd" />
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
          className="mb-32 grid gap-12"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}
        >
          {areas.map((item) => {
            const { area, measurement: m } = item;
            const s = STATUS[m.status];
            const AreaIcon = areaIcon(area.ikon);
            const TrendIcon = m.trend_dir === "up" ? TrendingUp : TrendingDown;
            const isSel = area.key === selected;
            const isDone = done[area.key];
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
                <span className="flex h-full flex-col p-16">
                  <span className="mb-12 flex items-start justify-between gap-8">
                    <span className={`icon-chip grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-background-content ${s.solidText}`}>
                      <AreaIcon size={17} strokeWidth={2} aria-hidden="true" />
                    </span>
                    {isDone && (
                      <span className="eyebrow-sm flex items-center gap-4 text-vattjom-text-primary">
                        <Check size={12} aria-hidden="true" />
                        Klar
                      </span>
                    )}
                  </span>
                  <span className="min-h-[34px] text-small font-semibold leading-tight tracking-tight text-dark-secondary">
                    {area.short ? `${area.namn} (${area.short})` : area.namn}
                  </span>
                  <span className="mb-12 mt-6 flex items-baseline gap-6">
                    <span className="font-header text-h2 font-bold leading-none tracking-tight">
                      {m.value_text}
                    </span>
                    {m.trend_dir && (
                      <TrendIcon
                        size={16}
                        strokeWidth={2.4}
                        className={m.trend_good ? "text-status-good" : "text-status-alert"}
                        aria-hidden="true"
                      />
                    )}
                  </span>
                  <span className="mt-auto block">
                    <span className="meter block">
                      <span className={`meter-fill block ${s.solid}`} style={{ width: `${fillPct}%` }} />
                      <span className="meter-target" style={{ left: `calc(${targetPct}% - 1px)` }} />
                    </span>
                    <span className="eyebrow-sm mt-6 flex justify-between">
                      <span>{area.lower_better ? "Lägre = bättre" : `Mål ${m.target_text}`}</span>
                      <span>{area.lower_better ? `Mål ${m.target_text}` : ""}</span>
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
              note={notes[current.area.key]}
              done={!!done[current.area.key]}
              onNoteChange={(next) =>
                setNotes((prev) => ({ ...prev, [current.area.key]: next }))
              }
              onToggleDone={() => toggleArea(current.area.key, current.area.id)}
              onNext={() => {
                const next = areas[(selectedIndex + 1) % areas.length];
                setSelected(next.area.key);
                scrollToDetail();
              }}
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
