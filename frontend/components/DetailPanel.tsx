"use client";

import { Button, FormControl, FormLabel, Input, Textarea } from "@sk-web-gui/react";
import {
  TrendingUp,
  TrendingDown,
  MessagesSquare,
  Wrench,
  ClipboardCheck,
  ArrowRight,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import type { DialogueArea } from "@/lib/api";
import { areaIcon } from "./icons";
import { STATUS } from "./status";

export interface Note {
  text: string;
  owner: string;
  date: string;
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
  onToggleDone: () => void;
  onNext: () => void;
}) {
  const { area, measurement: m } = item;
  const s = STATUS[m.status];
  const AreaIcon = areaIcon(area.ikon);
  const TrendIcon = m.trend_dir === "up" ? TrendingUp : TrendingDown;
  const trendColor = m.trend_good ? "text-success" : "text-error";

  return (
    <section
      className={`reveal overflow-hidden rounded-12 border ${s.border} bg-background-content`}
      aria-live="polite"
    >
      {/* Panelhuvud */}
      <div className={`border-b border-divider p-6 md:p-7 ${s.soft}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-12 border border-divider bg-background-content text-primary">
              <AreaIcon size={24} strokeWidth={2} aria-hidden="true" />
            </span>
            <div>
              <div className="eyebrow-sm mb-1">
                Område {index + 1} av {total}
              </div>
              <h2 className="font-header text-h4 font-bold leading-tight tracking-tight">
                {area.namn}
              </h2>
              <p className="mt-1.5 max-w-md text-small leading-snug text-dark-secondary">
                {m.interpretation}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="eyebrow-sm mb-1">Utfall</div>
            <div
              className={`inline-flex items-baseline gap-1.5 rounded-[10px] px-2.5 py-1.5 font-header text-h4 font-bold leading-none ${s.soft} ${s.text}`}
            >
              <span className={`inline-block h-2.5 w-2.5 rounded-full ${s.solid}`} aria-hidden="true" />
              {m.value_text}
            </div>
          </div>
        </div>

        {/* Nyckeltalsrad */}
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <div>
            <dt className="eyebrow-sm mb-1">Mål</dt>
            <dd className="text-base font-semibold">{m.target_text}</dd>
          </div>
          <div>
            <dt className="eyebrow-sm mb-1">Trend</dt>
            <dd className={`flex items-center gap-1.5 text-base font-semibold ${trendColor}`}>
              <TrendIcon size={16} strokeWidth={2.4} aria-hidden="true" />
              {m.trend_text}
            </dd>
          </div>
          <div>
            <dt className="eyebrow-sm mb-1">Stöd från</dt>
            <dd className="text-base font-semibold">{area.support_function.namn}</dd>
          </div>
          <div>
            <dt className="eyebrow-sm mb-1">Status i dialog</dt>
            <dd className={`text-base font-semibold ${done ? "text-primary" : "text-dark-secondary"}`}>
              {done ? "Genomgången" : "Ej genomgången"}
            </dd>
          </div>
        </dl>
      </div>

      {/* Panelkropp */}
      <div className="grid lg:grid-cols-2">
        {/* Samtalsstöd + verktygslåda */}
        <div className="border-divider p-6 md:p-7 lg:border-r">
          <div className="mb-1 flex items-center gap-2">
            <MessagesSquare size={16} className="text-primary" aria-hidden="true" />
            <h3 className="font-header text-base font-bold tracking-tight">Samtalsstöd</h3>
          </div>
          <p className="mb-2 text-small text-dark-secondary">Frågor att utgå från i dialogen.</p>
          <ul className="divide-y divide-divider">
            {area.questions.map((q) => (
              <li key={q.id} className="flex items-start gap-2.5 py-2.5">
                <span className="shrink-0 rounded-md bg-vattjom-background-100 px-1.5 py-0.5 font-mono text-small text-primary">
                  ?
                </span>
                <p className="pt-0.5 text-base leading-snug">{q.text}</p>
              </li>
            ))}
          </ul>

          <div className="mt-5">
            <div className="mb-2.5 flex items-center gap-2">
              <Wrench size={16} className="text-primary" aria-hidden="true" />
              <h3 className="font-header text-base font-bold tracking-tight">Verktygslåda &amp; stöd</h3>
            </div>
            <ul className="flex flex-wrap gap-2">
              {area.support_function.tools.map((t) => (
                <li
                  key={t.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-divider bg-background-content px-2.5 py-1 text-small"
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-vattjom-surface-accent" aria-hidden="true" />
                  {t.namn}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Överenskommelse */}
        <div className="bg-background p-6 md:p-7">
          <div className="mb-1 flex items-center gap-2">
            <ClipboardCheck size={16} className="text-primary" aria-hidden="true" />
            <h3 className="font-header text-base font-bold tracking-tight">
              Överenskommelse &amp; nästa steg
            </h3>
          </div>
          <p className="mb-4 text-small text-dark-secondary">
            Fånga vad ni kommer överens om — direkt i samtalet.
          </p>

          <FormControl className="mb-4 w-full">
            <FormLabel>Vad ska göras</FormLabel>
            <Textarea
              className="w-full"
              rows={4}
              value={note.text}
              onChange={(e) => onNoteChange({ ...note, text: e.target.value })}
              placeholder="t.ex. Ta fram åtgärdsplan tillsammans med controller inför nästa avstämning."
            />
          </FormControl>

          <div className="mb-5 grid grid-cols-2 gap-3">
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

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              color="vattjom"
              variant={done ? "secondary" : "primary"}
              onClick={onToggleDone}
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
              onClick={onNext}
              rightIcon={<ArrowRight size={16} aria-hidden="true" />}
            >
              Nästa område
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
