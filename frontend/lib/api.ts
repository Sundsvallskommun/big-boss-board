/** API-klient + typer som speglar backend-schemana (FastAPI/Pydantic).
 *  Server-side hämtning sker direkt mot backend på det interna nätverket;
 *  i webbläsaren går anrop via Next.js-rewrites (/api/* -> backend). */

export type Status = "good" | "warn" | "alert";
export type TrendDir = "up" | "down";

export interface Tool {
  id: number;
  namn: string;
  ordning: number;
}

export interface SupportFunction {
  id: number;
  key: string;
  namn: string;
  ikon: string;
  tools: Tool[];
}

export interface Question {
  id: number;
  text: string;
  ordning: number;
}

export interface KpiArea {
  id: number;
  key: string;
  namn: string;
  short: string | null;
  ikon: string;
  lower_better: boolean;
  ordning: number;
  support_function: SupportFunction;
  questions: Question[];
}

export interface Measurement {
  value_text: string;
  value_num: number;
  unit: string;
  target_text: string;
  target_num: number;
  bar_max: number;
  status: Status;
  trend_dir: TrendDir;
  trend_good: boolean;
  trend_text: string;
  interpretation: string;
}

export interface Agreement {
  id: number;
  text: string;
  ansvarig: string;
  klart_senast: string | null;
  genomgangen: boolean;
  updated_at: string;
}

export interface DialogueArea {
  area: KpiArea;
  measurement: Measurement;
  agreement: Agreement | null;
}

export interface Organisation {
  id: number;
  namn: string;
  slug: string;
}

export interface Person {
  id: number;
  namn: string;
  roll: string;
  initialer: string;
}

export interface DialogueDetail {
  id: number;
  period: string;
  status: string;
  skapad_at: string;
  organisation: Organisation;
  ansvarig_chef: Person;
  areas: DialogueArea[];
  progress_total: number;
  progress_done: number;
}

/** Bas-URL för server-side anrop. I webbläsaren används relativa /api via rewrites. */
const SERVER_BASE = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";

function apiBase(): string {
  // typeof window === "undefined" => körs på servern (Node), gå direkt mot backend.
  return typeof window === "undefined" ? SERVER_BASE : "";
}

export async function getDialogue(id: number): Promise<DialogueDetail> {
  const res = await fetch(`${apiBase()}/api/dialogues/${id}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Kunde inte hämta dialogen (HTTP ${res.status}).`);
  }
  return res.json();
}

export interface AgreementInput {
  text: string;
  ansvarig: string;
  klart_senast: string | null;
}

/** Skapa/uppdatera överenskommelsen för ett område (anropas i webbläsaren via proxyn). */
export async function upsertAgreement(
  dialogueId: number,
  areaId: number,
  body: AgreementInput,
): Promise<Agreement> {
  const res = await fetch(`/api/dialogues/${dialogueId}/areas/${areaId}/agreement`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error("Kunde inte spara överenskommelsen.");
  }
  return res.json();
}

/** Markera ett område som genomgånget eller ångra. */
export async function patchAreaReview(
  dialogueId: number,
  areaId: number,
  genomgangen: boolean,
): Promise<Agreement> {
  const res = await fetch(`/api/dialogues/${dialogueId}/areas/${areaId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ genomgangen }),
  });
  if (!res.ok) {
    throw new Error("Kunde inte uppdatera status.");
  }
  return res.json();
}
