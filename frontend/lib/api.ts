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
  /** Kort etikett över frågan ("Uppdraget"). Saknas för de flesta frågor. */
  rubrik?: string | null;
  text: string;
  /** Påstående ur medarbetarenkäten som frågan är härledd ur. */
  bygger_pa?: string | null;
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
  /** Delperspektivens egna årsserier: { motivation: { "2025": 80 }, … }. Samma mätår som
   *  totalen. Saknas nyckeln visas bara totalen — äldre rapporter har inga perspektiv. */
  perspektiv?: Record<string, Record<string, number>> | null;
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
  /** Beräknad i backend med samma definition som huvudvärdet. */
  diff?: number | null;
  period: string;
  budget_helar?: number | null;
  budget_ack?: number | null;
  utfall?: number | null;
  utfall_fg?: number | null;
  prognos?: number | null;
  /** Manuellt korrigerad punkt — märks ut i diagrammet. */
  korrigerad?: boolean;
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

/** Rapporterade andelar per period. SjukfranvaroDetails anger R12-metoden;
 *  samma värdeform används separat i kontrollunderlag med obekräftad metod. */
export interface SjukPunkt {
  period: string;
  total?: number | null;
  kvinnor?: number | null;
  man?: number | null;
}

/** Nedbrytning för sjukfrånvaro-mätvärdet: kön, långtidsandel, åldersgrupper + månadsserie. */
export interface SjukfranvaroDetails {
  typ: "sjukfranvaro";
  period?: string;
  kalla?: string;
  /** Hur värdena är aggregerade. "rullande12" sedan personalexporten lades om 2026-08;
   *  saknas fältet kommer datat från den gamla tertialackumulerade exporten. */
  matmetod?: string;
  kvinnor?: number | null;
  man?: number | null;
  langtidsandel?: number | null;
  /** Antal tillsvidareanställda (SK.P.AM.001) för perioden — underlag för kostnadsrutan. */
  anstallda?: number | null;
  aldersgrupper?: SjukAldersgrupp[];
  serie?: SjukPunkt[];
}

export interface Measurement {
  value_text: string;
  value_num: number | null;
  unit: string;
  target_text: string;
  target_num: number;
  bar_max: number;
  status: Status | null;
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

export type ActivityPatch = { text?: string; klar?: boolean; klar_notering?: string };

/** En manuellt satt status + kommentar för ett område (BYGGPLAN §16), per förvaltning.
 *  Append-only historik — en post per gång status sattes. */
export interface AreaStatus {
  id: number;
  /** Underdimension (Verksamhet: "grunduppdrag"/"fullmaktigemal"), null för enkel status. */
  dimension: string | null;
  status: Status;
  kommentar: string | null;
  satt_at: string;
}

export interface DialogueArea {
  area: KpiArea;
  /** null för nyckeltal utan mätdata (följs upp via dialogfrågor). */
  measurement: Measurement | null;
  /** Historik av manuellt satta statusar (nyast först). Tom = ej satt ännu. */
  status_historik: AreaStatus[];
  activities: Activity[];
  sjuk_kontroll?: SjukKontroll | null;
}

export interface SjukKontroll {
  fler_finns: boolean;
  underlag: {
    id: number;
    filnamn: string;
    status: "matmetod_okand" | "ogiltigt_underlag";
    skapad_at: string;
    enhet: {
      period: string;
      total: number | null;
      kvinnor: number | null;
      man: number | null;
      langtidsandel: number | null;
      anstallda: number | null;
      aldersgrupper: SjukAldersgrupp[];
      serie: SjukPunkt[];
    } | null;
  }[];
}

export interface Organisation {
  id: number;
  namn: string;
  slug: string;
  /** Masterdata-kod (BYGGPLAN §18) — kanonisk nyckel för referensdata. */
  kod?: string | null;
  /** Förvaltning, eller en av koncernens övriga verksamheter? Startsidan grupperar på detta.
   *  Äldre svar saknar fältet — behandla det som en förvaltning då. */
  ar_forvaltning?: boolean;
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

/** Fel från API-lagret med bevarad HTTP-status (så sidor kan skilja 404 från 5xx). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Gemensam transport: läsningar får omförsök, skrivningar görs exakt en gång.
 * Timeout på ett skrivanrop betyder okänt utfall, eftersom backend kan ha sparat redan. */
async function fetchJson<T>(path: string, label: string, init: RequestInit = {}): Promise<T> {
  const writing = init.method !== undefined && init.method !== "GET";
  const attempts = writing ? 1 : 3;
  const timeout = writing ? 15_000 : 5000;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const res = await fetch(`${apiBase()}${path}`, {
        ...init, cache: "no-store", signal: AbortSignal.timeout(timeout),
      });
      if (res.ok) return await res.json() as T;
      const error = new ApiError(`${label} (HTTP ${res.status}).`, res.status);
      if (res.status < 500 || writing) throw error;
      lastError = error;
    } catch (error) {
      if (error instanceof ApiError && (writing || (error.status ?? 500) < 500)) throw error;
      if (writing) throw new ApiError(
        `${label}. Svaret uteblev; ändringen kan ha sparats. Ladda om och kontrollera innan du försöker igen.`,
      );
      lastError = error;
    }
    if (attempt < attempts - 1) await sleep(150 * (attempt + 1));
  }
  throw lastError instanceof ApiError ? lastError : new ApiError(`${label}. Tjänsten svarade inte i tid.`);
}

export interface DialogueSummary {
  id: number;
  period: string;
  status: string;
  organisation: Organisation;
  ansvarig_chef: Person;
}

export async function listDialogues(): Promise<DialogueSummary[]> {
  return fetchJson<DialogueSummary[]>("/api/dialogues", "Kunde inte hämta dialoger");
}

export async function getDialogue(id: number): Promise<DialogueDetail> {
  return fetchJson<DialogueDetail>(`/api/dialogues/${id}`, "Kunde inte hämta dialogen");
}

/** Status-sidans kurerade kort (Fas B — flyttade från hårdkodad data.ts till DB). */
export interface StatusFraga {
  id: number;
  /** Publikt referensnummer "#N". */
  nummer: number;
  /** "fraga" = öppen/besvarad | "overgripande" = hanteras utanför projektet. */
  kategori: string;
  fraga: string;
  bakgrund: string | null;
  /** Finns svar → kortet visas som besvarat. */
  svar: string | null;
  forum: string | null;
  datum: string | null;
  forslag: string | null;
  mer: string[] | null;
  ordning: number;
  publicerad: boolean;
  submission_id: number | null;
}

export interface Statusrapport {
  id: number;
  datum: string;
  rubrik: string;
  text: string;
  punkter: string[] | null;
  aterstaende: string[] | null;
  ordning: number;
  publicerad: boolean;
}

export interface StatusContent {
  fragor: StatusFraga[];
  rapporter: Statusrapport[];
}

/** Publicerat status-innehåll (frågor + statusrapporter) i ett anrop. */
export async function listStatusContent(): Promise<StatusContent> {
  return fetchJson<StatusContent>("/api/status-cards", "Kunde inte hämta statusinnehåll");
}

/** Lägg till en aktivitet i ett område (anropas i webbläsaren via proxyn). */
export async function createActivity(
  dialogueId: number,
  areaId: number,
  text: string,
): Promise<Activity> {
  return fetchJson(`/api/dialogues/${dialogueId}/areas/${areaId}/activities`, "Kunde inte lägga till aktiviteten", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

}

/** Spara en ny manuell status + kommentar för ett område (per förvaltning). Append-only:
 *  varje anrop skapar en ny post i historiken; den nya posten returneras. */
export async function addAreaStatus(
  dialogueId: number,
  areaId: number,
  status: Status,
  kommentar: string,
  dimension: string | null = null,
): Promise<AreaStatus> {
  return fetchJson(`/api/dialogues/${dialogueId}/areas/${areaId}/status`, "Kunde inte spara statusen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, kommentar, dimension }),
  });

}

/** Klarrapportera en aktivitet med en kort notering. */
export async function markActivityKlar(activityId: number, notering: string): Promise<Activity> {
  return fetchJson(`/api/activities/${activityId}/klar`, "Kunde inte klarrapportera aktiviteten", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notering }),
  });

}

/** Ändra en aktivitet eller återöppna den utan att ersätta övriga fält. */
export async function updateActivity(activityId: number, patch: ActivityPatch): Promise<Activity> {
  return fetchJson(`/api/activities/${activityId}`, "Kunde inte spara ändringen", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

/** Ta bort en klarmarkerad aktivitet. Backend avvisar öppna aktiviteter. */
export async function deleteCompletedActivity(activityId: number): Promise<void> {
  await fetchJson<{ id: number }>(`/api/activities/${activityId}`, "Kunde inte ta bort aktiviteten", {
    method: "DELETE",
  });
}
