"use client";

import { useState } from "react";
import { MessagesSquare, SlidersHorizontal } from "lucide-react";
import type { AreaStatus, DialogueArea, Status } from "@/lib/api";
import { areaIcon } from "./icons";
import { STATUS } from "./status";
import { Button, FormControl, FormLabel, Textarea } from "@/components/ui";

type Feedback = { kind: "ok" | "err"; msg: string } | null;

const STATUS_VAL: { value: Status; label: string }[] = [
  { value: "good", label: "Grön" },
  { value: "warn", label: "Gul" },
  { value: "alert", label: "Röd" },
];

/** ISO-datetime → "2 jul 2026". Fritext/ogiltigt returneras oförändrat. */
const MANADER = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function visaDatum(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const [, ar, man, dag] = m;
  return `${Number(dag)} ${MANADER[Number(man) - 1]} ${ar}`;
}

/** Dialogpanel för nyckeltal UTAN mätdata (BYGGPLAN §16–17): områdets namn, ett par
 *  frågeställningar att ha dialog kring, och en manuellt satt status + kommentar. */
export function QuestionPanel({
  item,
  index,
  total,
  manuellStatus,
  onSaveStatus,
}: {
  item: DialogueArea;
  index: number;
  total: number;
  manuellStatus: AreaStatus | null;
  onSaveStatus: (status: Status, kommentar: string) => Promise<void>;
}) {
  const { area } = item;
  const AreaIcon = areaIcon(area.ikon);
  const fragor = [...area.questions].sort((a, b) => a.ordning - b.ordning);
  const st = manuellStatus ? STATUS[manuellStatus.status] : null;

  const [val, setVal] = useState<Status | null>(manuellStatus?.status ?? null);
  const [kommentar, setKommentar] = useState(manuellStatus?.kommentar ?? "");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function spara() {
    if (!val) {
      setFeedback({ kind: "err", msg: "Välj en status först." });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      await onSaveStatus(val, kommentar.trim());
      setFeedback({ kind: "ok", msg: "Status sparad." });
    } catch (e) {
      setFeedback({ kind: "err", msg: e instanceof Error ? e.message : "Något gick fel." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="reveal divide-y divide-hairline overflow-hidden rounded-12 border border-hairline bg-background-content">
      {/* Panelhuvud — tonas av aktuell status om satt, annars neutral vattjom-ton. */}
      <div className={st ? `bg-gradient-to-b to-background-content ${st.gradient}` : "bg-vattjom-background-100"}>
        <div className="flex flex-wrap items-start justify-between gap-16 p-24 md:p-28">
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
              <p className="mt-4 max-w-[576px] text-small leading-relaxed text-dark-secondary">
                Det här området har inget mätvärde — det följs upp genom dialog och en
                manuellt satt status.
              </p>
            </div>
          </div>
          {st && (
            <span className={`eyebrow-sm flex shrink-0 items-center gap-6 ${st.text}`}>
              <span className={`inline-block h-8 w-8 rounded-full ${st.solid}`} aria-hidden="true" />
              {st.legend}
            </span>
          )}
        </div>
      </div>

      {/* Frågeställningar */}
      <div className="p-24 md:p-28">
        <h3 className="eyebrow mb-16 flex items-center gap-8">
          <MessagesSquare size={14} aria-hidden="true" />
          Frågor att ha dialog kring
        </h3>
        {fragor.length > 0 ? (
          <ol className="flex flex-col gap-12">
            {fragor.map((q, i) => (
              <li
                key={q.id}
                className="flex items-start gap-14 rounded-12 border border-hairline bg-background-content p-16"
              >
                <span className="grid h-28 w-28 shrink-0 place-items-center rounded-full bg-vattjom-background-100 text-small font-semibold text-vattjom-text-primary">
                  {i + 1}
                </span>
                <p className="text-base leading-relaxed text-dark-primary">{q.text}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-small leading-relaxed text-dark-secondary">
            Inga frågeställningar tillagda ännu.
          </p>
        )}
      </div>

      {/* Manuell status + kommentar (sparas per förvaltning) */}
      <div className="p-24 md:p-28">
        <h3 className="eyebrow mb-4 flex items-center gap-8">
          <SlidersHorizontal size={14} aria-hidden="true" />
          Sätt status för området
        </h3>
        <p className="mb-16 text-small leading-relaxed text-dark-secondary">
          Välj en status utifrån dialogen och motivera kort varför. Sparas för den här
          förvaltningen.
          {manuellStatus && (
            <>
              {" "}
              Senast uppdaterad {visaDatum(manuellStatus.uppdaterad_at)}.
            </>
          )}
        </p>

        <div role="radiogroup" aria-label="Status" className="flex flex-wrap gap-8">
          {STATUS_VAL.map((o) => {
            const os = STATUS[o.value];
            const active = val === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setVal(o.value)}
                className={`inline-flex items-center gap-10 rounded-12 border px-20 py-14 text-large font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                  active
                    ? `${os.soft} ${os.border} ${os.text} ring-1 ring-inset ring-current`
                    : "border-hairline text-dark-secondary hover:border-dark-primary"
                }`}
              >
                <span className={`inline-block h-14 w-14 rounded-full ${os.solid}`} aria-hidden="true" />
                {o.label}
              </button>
            );
          })}
        </div>

        <FormControl className="mt-16 w-full">
          <FormLabel htmlFor={`status-kommentar-${area.key}`}>
            Kommentar — varför denna status?
          </FormLabel>
          <Textarea
            id={`status-kommentar-${area.key}`}
            value={kommentar}
            onChange={(e) => setKommentar(e.target.value)}
            rows={3}
            placeholder="Kort motivering till statusen…"
          />
        </FormControl>

        {feedback && (
          <p
            role={feedback.kind === "err" ? "alert" : "status"}
            className={`mt-12 text-small ${feedback.kind === "err" ? "text-error" : "text-success-text"}`}
          >
            {feedback.msg}
          </p>
        )}

        <Button className="mt-16" variant="primary" loading={busy} onClick={spara}>
          Spara status
        </Button>
      </div>
    </section>
  );
}
