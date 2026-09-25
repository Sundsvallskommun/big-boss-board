"use client";

import { useId, useState } from "react";
import { CheckCircle2, ListChecks, Pencil, Plus } from "lucide-react";
import { Button, FormControl, FormLabel, Input, Textarea } from "@/components/ui";
import type { Activity, ActivityPatch } from "@/lib/api";

type Feedback = { kind: "ok" | "err"; msg: string } | null;

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
  onEdit,
  onDelete,
}: {
  activity: Activity;
  onMarkKlar: (activityId: number, notering: string) => Promise<void>;
  onEdit: (activityId: number, patch: ActivityPatch) => Promise<void>;
  onDelete: (activityId: number) => Promise<void>;
}) {
  const fieldId = useId();
  // En åtgärd kan bara tas bort när den är klarmarkerad och användaren bekräftat det.
  const [mode, setMode] = useState<"visa" | "klar" | "andra" | "ta_bort">("visa");
  const [notering, setNotering] = useState("");
  const [utkast, setUtkast] = useState(activity.text);
  const [klarUtkast, setKlarUtkast] = useState(activity.klar_notering ?? "");
  const [busy, setBusy] = useState(false);
  const [fel, setFel] = useState("");

  async function spara() {
    setBusy(true);
    setFel("");
    try {
      await onMarkKlar(activity.id, notering);
      setMode("visa");
    } catch {
      setFel("Kunde inte klarrapportera aktiviteten. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  function borjaAndra() {
    setUtkast(activity.text);
    setKlarUtkast(activity.klar_notering ?? "");
    setFel("");
    setMode("andra");
  }

  async function sparaAndring() {
    const text = utkast.trim();
    if (!text) {
      setFel("Aktiviteten behöver en text.");
      return;
    }
    setBusy(true);
    setFel("");
    try {
      // Klarrapportens notering hör ihop med texten — båda sparas i samma anrop.
      await onEdit(
        activity.id,
        activity.klar ? { text, klar_notering: klarUtkast } : { text },
      );
      setMode("visa");
    } catch {
      setFel("Kunde inte spara ändringen. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  async function angraKlar() {
    setBusy(true);
    setFel("");
    try {
      await onEdit(activity.id, { klar: false });
      setNotering("");
      setMode("visa");
    } catch {
      setFel("Kunde inte ångra klarmarkeringen. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  async function taBort() {
    setBusy(true);
    setFel("");
    try {
      await onDelete(activity.id);
    } catch {
      setFel("Kunde inte ta bort aktiviteten. Ladda om och kontrollera innan du försöker igen.");
    } finally {
      setBusy(false);
    }
  }

  const andrar = mode === "andra";

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
            <span className="block h-18 w-18 rounded-full border-2 border-hairline" />
          )}
        </span>

        <div className="min-w-0 flex-1">
          {andrar ? (
            <FormControl className="w-full">
              <FormLabel htmlFor={`${fieldId}-text`}>Aktivitetens text</FormLabel>
              <Textarea
                id={`${fieldId}-text`}
                value={utkast}
                rows={3}
                maxLength={4000}
                disabled={busy}
                onChange={(e) => setUtkast(e.target.value)}
                placeholder="Vad ska göras?"
              />
            </FormControl>
          ) : (
            <p
              className={`text-small leading-snug ${
                activity.klar ? "text-dark-secondary line-through" : ""
              }`}
            >
              {activity.text}
            </p>
          )}

          {activity.klar && !andrar && (
            <div className="mt-10 rounded-10 bg-success-background-300 px-12 py-10">
              <div className="eyebrow-sm text-success-text">
                Klarrapport{kortDatum(activity.klar_at) && ` · ${kortDatum(activity.klar_at)}`}
              </div>
              <p className="mt-2 text-small leading-snug text-dark-primary">
                {activity.klar_notering || "—"}
              </p>
            </div>
          )}

          {activity.klar && andrar && (
            <div className="mt-12">
              <FormControl className="w-full">
                <FormLabel htmlFor={`${fieldId}-edit-note`}>Notering om klarrapporteringen</FormLabel>
                <Input
                  id={`${fieldId}-edit-note`}
                  value={klarUtkast}
                  maxLength={1000}
                  disabled={busy}
                  onChange={(e) => setKlarUtkast(e.target.value)}
                  placeholder="Kort notering om vad som gjorts…"
                />
              </FormControl>
            </div>
          )}

          {andrar && (
            <div className="mt-10 flex flex-wrap gap-8">
              <Button
                color="vattjom"
                variant="primary"
                loading={busy}
                disabled={busy}
                onClick={sparaAndring}
              >
                Spara ändring
              </Button>
              <Button
                color="vattjom"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setFel("");
                  setMode("visa");
                }}
              >
                Avbryt
              </Button>
              {activity.klar && (
                <Button color="vattjom" variant="ghost" disabled={busy} onClick={angraKlar}>
                  Ångra klarmarkering
                </Button>
              )}
            </div>
          )}

          {mode === "klar" && !activity.klar && (
            <div className="mt-12">
              <FormControl className="w-full">
                <FormLabel htmlFor={`${fieldId}-done-note`}>Notering om klarrapporteringen</FormLabel>
                <Input
                  id={`${fieldId}-done-note`}
                  value={notering}
                  maxLength={1000}
                  disabled={busy}
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
                <Button
                  color="vattjom"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setFel("");
                    setMode("visa");
                  }}
                >
                  Avbryt
                </Button>
              </div>
            </div>
          )}

          {mode === "ta_bort" && activity.klar && (
            <div className="mt-12 rounded-10 border border-error-text bg-error-background-200 p-12">
              <p id={`${fieldId}-delete-warning`} className="text-small text-error-text">
                Ta bort aktiviteten och dess klarrapport permanent?
              </p>
              <div className="mt-10 flex flex-wrap gap-8">
                <Button
                  variant="ghost"
                  aria-describedby={`${fieldId}-delete-warning`}
                  autoFocus
                  loading={busy}
                  disabled={busy}
                  onClick={taBort}
                >
                  Ja, ta bort
                </Button>
                <Button
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setFel("");
                    setMode("visa");
                  }}
                >
                  Avbryt
                </Button>
              </div>
            </div>
          )}

          {fel && (
            <p role="alert" className="mt-10 text-small text-error-text">
              {fel}
            </p>
          )}
        </div>

        {mode === "visa" && (
          <div className="flex shrink-0 flex-wrap justify-end gap-6">
            <button
              type="button"
              onClick={borjaAndra}
              className="inline-flex shrink-0 items-center gap-4 rounded-full border border-hairline px-10 py-3 text-[12px] font-semibold text-dark-secondary transition hover:border-dark-primary hover:text-dark-primary focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              <Pencil size={13} aria-hidden="true" />
              Ändra
            </button>
            {!activity.klar && (
              <button
                type="button"
                onClick={() => setMode("klar")}
                className="inline-flex shrink-0 items-center gap-4 rounded-full border border-vattjom-surface-primary px-10 py-3 text-[12px] font-semibold text-vattjom-text-primary transition hover:bg-vattjom-background-100 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <CheckCircle2 size={13} aria-hidden="true" />
                Klarmarkera
              </button>
            )}
            {activity.klar && (
              <button
                type="button"
                onClick={() => { setFel(""); setMode("ta_bort"); }}
                className="inline-flex shrink-0 items-center rounded-full border border-error-text px-10 py-3 text-[12px] font-semibold text-error-text transition hover:bg-error-background-200 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                Ta bort
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

/** Delad aktivitetssektion för det område som Dashboard visar. */
export function ActivitiesSection({
  activities,
  onAddActivity,
  onMarkKlar,
  onEditActivity,
  onDeleteActivity,
}: {
  activities: Activity[];
  onAddActivity: (text: string) => Promise<void>;
  onMarkKlar: (activityId: number, notering: string) => Promise<void>;
  onEditActivity: (activityId: number, patch: ActivityPatch) => Promise<void>;
  onDeleteActivity: (activityId: number) => Promise<void>;
}) {
  const fieldId = useId();
  const klara = activities.filter((a) => a.klar).length;

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

  // Egen sektion — frikopplad från översikten med mellanrum.
  return (
    <section
      id="aktiviteter"
      className="reveal mt-16 scroll-mt-88 overflow-hidden rounded-12 border border-hairline bg-background-content"
    >
    <div className="grid lg:grid-cols-2">
      {/* Aktiviteter & åtgärder */}
      <div className="border-hairline p-24 md:p-28 lg:border-r">
        <div className="mb-4 flex items-center gap-10">
          <span className="grid h-34 w-34 shrink-0 place-items-center rounded-10 bg-vattjom-background-100 text-vattjom-text-primary">
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
            <p className="max-w-260 text-small leading-snug text-dark-secondary">
              Inga aktiviteter ännu. Lägg till en till höger så dyker den upp här.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-12">
            {/* Aktiva överst, klarmarkerade under — i skapandeordning inom varje grupp. */}
            {[...activities]
              .sort((a, b) => Number(a.klar) - Number(b.klar) || a.id - b.id)
              .map((a) => (
                <ActivityRow
                  key={a.id}
                  activity={a}
                  onMarkKlar={onMarkKlar}
                  onEdit={onEditActivity}
                  onDelete={onDeleteActivity}
                />
              ))}
          </ul>
        )}
      </div>

      {/* Lägg till aktivitet */}
      <div className="bg-background-200 p-24 md:p-28">
        <div className="mb-4 flex items-center gap-10">
          <span className="grid h-34 w-34 shrink-0 place-items-center rounded-10 bg-background-content text-vattjom-text-primary">
            <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <h3 className="font-header text-base font-bold tracking-tight">Lägg till aktivitet</h3>
        </div>
        <p className="mb-16 text-small text-dark-secondary">
          Skriv en aktivitet eller åtgärd så hamnar den i listan till vänster.
        </p>

        <FormControl className="mb-12 w-full">
          <FormLabel htmlFor={`${fieldId}-new`}>Aktivitet</FormLabel>
          <Textarea
            id={`${fieldId}-new`}
            className="w-full"
            rows={3}
            value={nyText}
            maxLength={4000}
            disabled={addBusy}
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
  );
}
