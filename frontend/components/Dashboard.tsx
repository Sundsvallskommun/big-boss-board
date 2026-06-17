"use client";

import { useMemo, useState } from "react";
import { Logo, Alert } from "@sk-web-gui/react";
import { TrendingUp, TrendingDown, Check } from "lucide-react";
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
  const goodShare = useMemo(() => {
    if (areas.length === 0) return 0;
    return areas.filter((a) => a.measurement.status === "good").length / areas.length;
  }, [areas]);

  const selectedIndex = Math.max(
    0,
    areas.findIndex((a) => a.area.key === selected),
  );
  const current = areas[selectedIndex];

  const gaugeLabel =
    goodShare >= 0.75 ? "I mål" : goodShare >= 0.4 ? "Delvis i mål" : "Under mål";

  function scrollToDetail() {
    document.getElementById("detail")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function noteToInput(key: string): AgreementInput {
    const n = notes[key];
    return { text: n.text, ansvarig: n.owner, klart_senast: n.date || null };
  }

  // Persistera överenskommelsen för ett område.
  async function saveArea(key: string, areaId: number) {
    await upsertAgreement(dialogue.id, areaId, noteToInput(key));
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
      <header className="sticky top-0 z-30 border-b border-divider bg-background-content/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between gap-4 px-6 py-4 md:px-8">
          <div className="flex min-w-0 items-center gap-3.5">
            <span className="flex h-10 items-center [&_svg]:h-10 [&_svg]:w-auto">
              <Logo variant="logo" />
            </span>
            <span className="h-9 w-px shrink-0 bg-divider" aria-hidden="true" />
            <span className="truncate text-base font-semibold tracking-tight">Dialogstöd</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2.5 rounded-full border border-divider px-3 py-1.5 sm:flex">
              <span className="eyebrow-sm">
                {doneCount} av {areas.length} genomgångna
              </span>
              <span className="flex items-center gap-1" aria-hidden="true">
                {areas.map((a) => (
                  <span
                    key={a.area.key}
                    className={`inline-block h-2 w-2 rounded-full ${
                      done[a.area.key] ? "bg-vattjom-surface-accent" : "bg-background"
                    }`}
                  />
                ))}
              </span>
            </div>
            <div className="grid h-8 w-8 place-items-center rounded-full bg-vattjom-surface-primary text-small font-semibold text-white">
              {dialogue.ansvarig_chef.initialer}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-6 pb-24 pt-8 md:px-8 md:pt-10">
        {/* ===== Rubrik + kontext ===== */}
        <div className="mb-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div>
            <div className="eyebrow mb-2">Uppföljningsdialog · chef &amp; chef</div>
            <h1 className="font-header text-h1 font-bold leading-tight tracking-tight">
              Samlad bild för <span className="text-primary">dialog</span>
            </h1>
            <p className="mt-2 max-w-xl text-base leading-relaxed text-dark-secondary">
              Gå igenom nyckeltalen tillsammans, ett område i taget. Fånga vad ni kommer överens om
              direkt i samtalet.
            </p>
          </div>
          <div className="flex items-center gap-4 rounded-12 border border-divider bg-background-content px-4 py-3">
            <div>
              <div className="eyebrow-sm">Verksamhet</div>
              <div className="mt-0.5 text-base font-semibold leading-tight">
                {dialogue.organisation.namn}
              </div>
              <div className="text-small leading-tight text-dark-secondary">Sundsvalls kommun</div>
            </div>
            <span className="h-9 w-px bg-divider" aria-hidden="true" />
            <div>
              <div className="eyebrow-sm">Ansvarig chef</div>
              <div className="mt-0.5 text-base font-semibold leading-tight">
                {dialogue.ansvarig_chef.namn}
              </div>
              <div className="text-small leading-tight text-dark-secondary">{dialogue.period}</div>
            </div>
          </div>
        </div>

        {/* ===== Norra stjärnan ===== */}
        <section className="mb-8 overflow-hidden rounded-12 border border-divider bg-background-content">
          <div className="grid items-center gap-6 p-6 md:grid-cols-[1fr_auto] md:p-7">
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <span className="eyebrow w-[68px] shrink-0 pt-1.5">Effekt</span>
                <p className="text-large font-semibold leading-snug tracking-tight">
                  Sundsvalls kommun uppnår <span className="text-primary">samtliga uppdrag</span>
                </p>
              </div>
              <div className="h-px bg-divider" />
              <div className="flex items-start gap-3">
                <span className="eyebrow w-[68px] shrink-0 pt-1.5">Resultat</span>
                <p className="text-large font-semibold leading-snug tracking-tight">
                  Chefer säkrar resultat och måluppfyllelse
                </p>
              </div>
            </div>
            <Gauge level={goodShare} label={gaugeLabel} hint="Flera områden kräver åtgärd" />
          </div>
        </section>

        {/* ===== KPI-strip ===== */}
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="font-header text-h3 font-bold tracking-tight">Ansvarsområden</h2>
            <p className="mt-0.5 text-small text-dark-secondary">
              Välj ett område för att öppna dialogen.
            </p>
          </div>
          <div className="hidden items-center gap-4 pb-1 md:flex">
            {(["good", "warn", "alert"] as const).map((st) => (
              <span key={st} className="eyebrow-sm flex items-center gap-1.5">
                <span className={`inline-block h-2.5 w-2.5 rounded-full ${STATUS[st].solid}`} />
                {STATUS[st].legend}
              </span>
            ))}
          </div>
        </div>

        <div
          className="mb-8 grid gap-3"
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
                className={`flex flex-col overflow-hidden rounded-12 border bg-background-content text-left transition hover:-translate-y-0.5 hover:border-dark-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  isSel ? "border-primary ring-1 ring-primary" : "border-divider"
                }`}
              >
                <span className={`h-1 w-full ${s.solid}`} aria-hidden="true" />
                <span className="flex h-full flex-col p-4">
                  <span className="mb-3 flex items-start justify-between gap-2">
                    <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] border border-divider bg-background-content text-primary">
                      <AreaIcon size={17} strokeWidth={2} aria-hidden="true" />
                    </span>
                    {isDone ? (
                      <span className="eyebrow-sm flex items-center gap-1 text-primary">
                        <Check size={12} aria-hidden="true" />
                        Klar
                      </span>
                    ) : (
                      <span className={`mt-1.5 inline-block h-2.5 w-2.5 rounded-full ${s.solid}`} aria-hidden="true" />
                    )}
                  </span>
                  <span className="min-h-[34px] text-small font-semibold leading-tight tracking-tight text-dark-secondary">
                    {area.short ? `${area.namn} (${area.short})` : area.namn}
                  </span>
                  <span className="mb-3 mt-1.5 flex items-baseline gap-1.5">
                    <span className="font-header text-h2 font-bold leading-none tracking-tight">
                      {m.value_text}
                    </span>
                    <TrendIcon
                      size={16}
                      strokeWidth={2.4}
                      className={m.trend_good ? "text-success" : "text-error"}
                      aria-hidden="true"
                    />
                  </span>
                  <span className="mt-auto block">
                    <span className="meter block">
                      <span className={`meter-fill block ${s.solid}`} style={{ width: `${fillPct}%` }} />
                      <span className="meter-target" style={{ left: `calc(${targetPct}% - 1px)` }} />
                    </span>
                    <span className="eyebrow-sm mt-1.5 flex justify-between">
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
              onSave={() => saveArea(current.area.key, current.area.id)}
              onToggleDone={() => toggleArea(current.area.key, current.area.id)}
              onNext={() => {
                const next = areas[(selectedIndex + 1) % areas.length];
                setSelected(next.area.key);
                scrollToDetail();
              }}
            />
          )}
        </div>

        <div className="mt-10">
          <Alert.Component type="info" size="sm">
            Använd endast öppen och publik information i dialogen. All data i tjänsten är fiktiv.
          </Alert.Component>
        </div>
      </main>
    </>
  );
}
