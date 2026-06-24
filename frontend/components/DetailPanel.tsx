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
  MessagesSquare,
  Wrench,
  ClipboardCheck,
  ArrowRight,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import type { DialogueArea, HmeDetails } from "@/lib/api";
import { areaIcon } from "./icons";
import { STATUS } from "./status";

export interface Note {
  text: string;
  owner: string;
  date: string;
}

type Feedback = { kind: "ok" | "err"; msg: string } | null;

/** Liten historik-sparkline för HME:s årsserie (form min–max-skalad, värden i klartext under). */
function HmeHistory({ details }: { details: HmeDetails }) {
  const m = details.matningar ?? {};
  const pts = Object.keys(m).sort().map((year) => ({ year, value: m[year] }));
  if (pts.length === 0) return null;
  const vals = pts.map((p) => p.value);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const W = 280, H = 56, pad = 6;
  const xy = pts.map((p, i) => ({
    ...p,
    x: pad + (W - 2 * pad) * (pts.length === 1 ? 0.5 : i / (pts.length - 1)),
    y: pad + (H - 2 * pad) * (1 - (p.value - min) / span),
  }));
  const line = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const last = xy[xy.length - 1];
  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`HME-historik: ${pts.map((p) => `${p.year} ${p.value}`).join(", ")}`}
        className="max-w-[320px]"
      >
        <path d={line} fill="none" className="stroke-vattjom-surface-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={last.x} cy={last.y} r={3.5} className="fill-vattjom-surface-primary" />
      </svg>
      <div className="mt-8 flex flex-wrap gap-x-16 gap-y-4">
        {pts.map((p) => (
          <span
            key={p.year}
            className={`text-small tabular-nums ${
              p.year === String(details.senaste_ar) ? "font-semibold text-dark-primary" : "text-dark-secondary"
            }`}
          >
            {p.year}: {p.value}
          </span>
        ))}
      </div>
    </div>
  );
}

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

export function DetailPanel({
  item,
  index,
  total,
  note,
  done,
  onNoteChange,
  onToggleDone,
  onNext,
}: {
  item: DialogueArea;
  index: number;
  total: number;
  note: Note;
  done: boolean;
  onNoteChange: (next: Note) => void;
  onToggleDone: () => Promise<void>;
  onNext: () => void;
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

  // Datumberoende notis beräknas klient-sida efter mount (undviker hydrerings-krock
  // och använder läsarens lokala datum). null = inte uträknat ännu / inte aktuellt.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const ekonomiNotis =
    area.key === "ekonomi" && now ? ekonomiOfullstandig(now) : null;

  const [busy, setBusy] = useState<"save" | "done" | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function run(kind: "save" | "done", action: () => Promise<void>, okMsg: string) {
    setBusy(kind);
    setFeedback(null);
    try {
      await action();
      setFeedback({ kind: "ok", msg: okMsg });
    } catch (e) {
      setFeedback({ kind: "err", msg: e instanceof Error ? e.message : "Något gick fel." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="reveal overflow-hidden rounded-12 border border-hairline bg-background-content">
      {/* Panelhuvud — mjuk statston som tonar ut mot vitt (som prototypen) */}
      <div className={`border-b border-hairline bg-gradient-to-b to-background-content p-24 md:p-28 ${s.gradient}`}>
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
          <div className="text-right">
            <div className="eyebrow-sm mb-4">Utfall</div>
            <div
              className={`inline-flex items-baseline rounded-[10px] px-10 py-6 font-header text-h4 font-bold leading-none ${s.soft} ${s.text}`}
            >
              {m.value_text}
            </div>
          </div>
        </div>

        {/* Nyckeltalsrad */}
        <dl className="mt-24 grid grid-cols-2 gap-x-24 gap-y-12 sm:grid-cols-4">
          <div>
            <dt className="eyebrow-sm mb-4">Mål</dt>
            <dd className="text-base font-semibold">{m.target_text}</dd>
          </div>
          <div>
            <dt className="eyebrow-sm mb-4">Trend</dt>
            <dd className={`flex items-center gap-6 text-base font-semibold ${trendColor}`}>
              <TrendIcon size={16} strokeWidth={2.4} aria-hidden="true" />
              <span className={hasTrend ? "" : "text-small font-normal"}>{m.trend_text}</span>
            </dd>
          </div>
          <div>
            <dt className="eyebrow-sm mb-4">Stöd från</dt>
            <dd className="text-base font-semibold">{area.support_function.namn}</dd>
          </div>
          <div>
            <dt className="eyebrow-sm mb-4">Status i dialog</dt>
            <dd className={`text-base font-semibold ${done ? "text-vattjom-text-primary" : "text-dark-secondary"}`}>
              {done ? "Genomgången" : "Ej genomgången"}
            </dd>
          </div>
        </dl>
      </div>

      {/* Datumberoende notis: ekonomidata är ofullständig tidigt i månaden (1–9, senare i jan) */}
      {ekonomiNotis?.ofullstandig && (
        <div className="border-b border-hairline bg-warning-background-100 p-24 md:p-28">
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

      {/* Faktaruta om nyckeltalet (t.ex. datakvalitet) — visas när området har info-text */}
      {area.info && (
        <div className="border-b border-hairline bg-vattjom-background-100 p-24 md:p-28">
          <div className="flex items-start gap-12">
            <span className="mt-2 shrink-0 text-vattjom-text-primary">
              <Info size={18} strokeWidth={2.2} aria-hidden="true" />
            </span>
            <div>
              <h3 className="font-header text-base font-bold tracking-tight">Att tänka på om siffran</h3>
              <p className="mt-6 max-w-[640px] text-small leading-relaxed text-dark-secondary">
                {area.info}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* HME-nedbrytning (visas bara för HME): historik (officiella rapporten) och/eller
          delindex + chef/medarbetare (rådata). Renderas villkorat per tillgängliga fält. */}
      {hme && (hme.matningar || hme.delindex) && (
        <div className="border-b border-hairline bg-background-content p-24 md:p-28">
          <div className="mb-4 flex items-center gap-8">
            <BarChart3 size={16} className="text-vattjom-text-primary" aria-hidden="true" />
            <h3 className="font-header text-base font-bold tracking-tight">
              HME-index {hme.senaste_ar ?? hme.ar}
            </h3>
          </div>

          {/* Historik (officiella rapporten) */}
          {hme.matningar && (
            <>
              <p className="mb-12 text-small text-dark-secondary">
                Officiell HME-mätning, index 0–100 per år
                {hme.antal_svar ? ` (${hme.antal_svar} svar senaste mätningen)` : ""}.
              </p>
              <HmeHistory details={hme} />
            </>
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

      {/* Panelkropp */}
      <div className="grid lg:grid-cols-2">
        {/* Samtalsstöd + verktygslåda */}
        <div className="border-hairline p-24 md:p-28 lg:border-r">
          <div className="mb-4 flex items-center gap-8">
            <MessagesSquare size={16} className="text-vattjom-text-primary" aria-hidden="true" />
            <h3 className="font-header text-base font-bold tracking-tight">Samtalsstöd</h3>
          </div>
          <p className="mb-8 text-small text-dark-secondary">Frågor att utgå från i dialogen.</p>
          <ul className="divide-y divide-hairline">
            {area.questions.map((q) => (
              <li key={q.id} className="flex items-start gap-10 py-10">
                <span className="shrink-0 rounded-md bg-vattjom-background-100 px-6 py-2 font-mono text-small text-vattjom-text-primary">
                  ?
                </span>
                <p className="pt-2 text-base leading-snug">{q.text}</p>
              </li>
            ))}
          </ul>

          <div className="mt-20">
            <div className="mb-10 flex items-center gap-8">
              <Wrench size={16} className="text-vattjom-text-primary" aria-hidden="true" />
              <h3 className="font-header text-base font-bold tracking-tight">Verktygslåda &amp; stöd</h3>
            </div>
            <ul className="flex flex-wrap gap-8">
              {area.support_function.tools.map((t) => (
                <li
                  key={t.id}
                  className="inline-flex items-center gap-6 rounded-full border border-hairline bg-background-content px-10 py-4 text-small"
                >
                  <span className="inline-block h-6 w-6 rounded-full bg-vattjom-surface-accent" aria-hidden="true" />
                  {t.namn}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Överenskommelse */}
        <div className="bg-background-200 p-24 md:p-28">
          <div className="mb-4 flex items-center gap-8">
            <ClipboardCheck size={16} className="text-vattjom-text-primary" aria-hidden="true" />
            <h3 className="font-header text-base font-bold tracking-tight">
              Överenskommelse &amp; nästa steg
            </h3>
          </div>
          <p className="mb-16 text-small text-dark-secondary">
            Fånga vad ni kommer överens om — direkt i samtalet.
          </p>

          <FormControl className="mb-16 w-full">
            <FormLabel>Vad ska göras</FormLabel>
            <Textarea
              className="w-full"
              rows={4}
              value={note.text}
              onChange={(e) => onNoteChange({ ...note, text: e.target.value })}
              placeholder="t.ex. Ta fram åtgärdsplan tillsammans med controller inför nästa avstämning."
            />
          </FormControl>

          <div className="mb-20 grid grid-cols-2 gap-12">
            <FormControl className="w-full">
              <FormLabel>Ansvarig</FormLabel>
              <Input
                value={note.owner}
                onChange={(e) => onNoteChange({ ...note, owner: e.target.value })}
                placeholder="Namn"
              />
            </FormControl>
            <FormControl className="w-full">
              <FormLabel>Klart senast</FormLabel>
              <Input
                type="date"
                value={note.date}
                onChange={(e) => onNoteChange({ ...note, date: e.target.value })}
              />
            </FormControl>
          </div>

          <div className="flex flex-wrap items-center gap-12">
            <Button
              color="vattjom"
              variant="primary"
              loading={busy === "done"}
              disabled={busy !== null}
              onClick={() =>
                run("done", onToggleDone, done ? "Ångrat." : "Markerad som genomgången.")
              }
              leftIcon={
                done ? (
                  <RotateCcw size={16} aria-hidden="true" />
                ) : (
                  <CheckCircle2 size={16} aria-hidden="true" />
                )
              }
            >
              {done ? "Ångra genomgången" : "Markera som genomgången"}
            </Button>
            <Button
              color="vattjom"
              variant="ghost"
              disabled={busy !== null}
              onClick={onNext}
              rightIcon={<ArrowRight size={16} aria-hidden="true" />}
            >
              Nästa område
            </Button>
          </div>

          <p
            role="status"
            aria-live="polite"
            className={`mt-12 min-h-[1.25rem] text-small ${
              feedback?.kind === "err" ? "text-status-alert" : "text-dark-secondary"
            }`}
          >
            {feedback?.msg ?? ""}
          </p>
        </div>
      </div>
    </section>
  );
}
