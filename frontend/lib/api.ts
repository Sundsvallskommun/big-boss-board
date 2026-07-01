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
  info: string | null;
  support_function: SupportFunction;
  questions: Question[];
}

/** Delindex (0–100) per HME-dimension. */
export interface HmeDelindex {
  motivation: number;
  styrning: number;
  ledarskap: number;
}

export interface HmeSegment {
  n: number;
  hme_total: number;
  delindex: HmeDelindex;
}

export interface HmeTrendMeta {
  from_ar: number;
  till_ar: number;
  diff: number;
}

/** Nedbrytning för HME-mätvärdet (null för övriga KPI:er). Fälten varierar med källa:
 *  officiella rapporten ger flerårig serie (matningar/trend), rådata ger delindex/segment. */
export interface HmeDetails {
  typ: "hme";
  // Officiella rapporten (flerårig serie).
  enhet?: string;
  kalla?: string;
  antal_svar?: number | null;
  senaste_ar?: number;
  matningar?: Record<string, number>;
  trend?: HmeTrendMeta | null;
  // Rådata-aggregat (valfritt — delindex + chef/medarbetare).
  ar?: number;
  n?: number;
  delindex?: HmeDelindex;
  segment?: { chef: HmeSegment; medarbetare: HmeSegment } | null;
}

/** Ett resultaträkningsmått (mnkr; null = saknas för enheten). */
export interface EkonomiMattRad {
  matt_kod: string;
  namn: string;
  budget_helar?: number | null;
  budget_ack?: number | null;
  utfall?: number | null;
  utfall_fg?: number | null;
  prognos?: number | null;
}

/** Nettokostnad nedbruten på ett verksamhetsområde (klartextnamn ofta okänt ännu). */
export interface EkonomiOmradeRad {
  omrade_kod: string | null;
  namn?: string | null;
  utfall?: number | null;
  budget_ack?: number | null;
}

/** Nettokostnad (RR.005) en rapportperiod — en punkt i månadsserien (mnkr). */
export interface EkonomiSeriePunkt {
  period: string;
  budget_helar?: number | null;
  budget_ack?: number | null;
  utfall?: number | null;
  utfall_fg?: number | null;
  prognos?: number | null;
}

/** Nedbrytning för ekonomi-mätvärdet: resultaträkning + nettokostnad per område (mnkr). */
export interface EkonomiDetails {
  typ: "ekonomi";
  enhet?: string;
  kalla?: string;
  period?: string;
  resultatrakning?: EkonomiMattRad[];
  nettokostnad_per_omrade?: EkonomiOmradeRad[];
  /** Månadsserie av nettokostnad över året (tom/utelämnad → bara senaste perioden). */
  serie?: EkonomiSeriePunkt[];
}

/** Sjukfrånvaro per åldersgrupp (% av ordinarie arbetstid). */
export interface SjukAldersgrupp {
  grupp: string;
  varde?: number | null;
}

/** Sjukfrånvaro en period (tidsserie): total %, kvinnors andel %, mäns andel %. */
export interface SjukPunkt {
  period: string;
  total?: number | null;
  kvinnor?: number | null;
  man?: number | null;
}

/** Nedbrytning för sjukfrånvaro-mätvärdet: kön, långtidsandel, åldersgrupper + tidsserie. */
export interface SjukfranvaroDetails {
  typ: "sjukfranvaro";
  period?: string;
  kalla?: string;
  kvinnor?: number | null;
  man?: number | null;
  langtidsandel?: number | null;
  aldersgrupper?: SjukAldersgrupp[];
  serie?: SjukPunkt[];
}

export interface Measurement {
  value_text: string;
  value_num: number;
  unit: string;
  target_text: string;
  target_num: number;
  bar_max: number;
  status: Status;
  /** null när jämförelseperiod saknas (visas som neutral platshållare). */
  trend_dir: TrendDir | null;
  trend_good: boolean | null;
  trend_text: string;
  interpretation: string;
  /** Typspecifik nedbrytning. Diskriminera på `details.typ`. */
  details: HmeDetails | EkonomiDetails | SjukfranvaroDetails | null;
}

export interface Activity {
  id: number;
  text: string;
  klar: boolean;
  klar_notering: string | null;
  skapad_at: string;
  klar_at: string | null;
}

export interface DialogueArea {
  area: KpiArea;
  measurement: Measurement;
  activities: Activity[];
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
}

/** Bas-URL för server-side anrop. I webbläsaren används relativa /api via rewrites. */
const SERVER_BASE = process.env.BACKEND_INTERNAL_URL ?? "http://backend:8000";

function apiBase(): string {
  // typeof window === "undefined" => körs på servern (Node), gå direkt mot backend.
  return typeof window === "undefined" ? SERVER_BASE : "";
}

export interface DialogueSummary {
  id: number;
  period: string;
  status: string;
  organisation: Organisation;
  ansvarig_chef: Person;
}

export async function listDialogues(): Promise<DialogueSummary[]> {
  const res = await fetch(`${apiBase()}/api/dialogues`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Kunde inte hämta dialoger (HTTP ${res.status}).`);
  }
  return res.json();
}

export async function getDialogue(id: number): Promise<DialogueDetail> {
  const res = await fetch(`${apiBase()}/api/dialogues/${id}`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Kunde inte hämta dialogen (HTTP ${res.status}).`);
  }
  return res.json();
}

/** Lägg till en aktivitet i ett område (anropas i webbläsaren via proxyn). */
export async function createActivity(
  dialogueId: number,
  areaId: number,
  text: string,
): Promise<Activity> {
  const res = await fetch(`/api/dialogues/${dialogueId}/areas/${areaId}/activities`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    throw new Error("Kunde inte lägga till aktiviteten.");
  }
  return res.json();
}

/** Klarrapportera en aktivitet med en kort notering. */
export async function markActivityKlar(activityId: number, notering: string): Promise<Activity> {
  const res = await fetch(`/api/activities/${activityId}/klar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notering }),
  });
  if (!res.ok) {
    throw new Error("Kunde inte klarrapportera aktiviteten.");
  }
  return res.json();
}
