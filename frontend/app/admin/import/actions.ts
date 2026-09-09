"use server";

import { isAdmin } from "@/lib/auth";
import { revalidatePath } from "next/cache";

export type ImportRad = { namn: string; value: string; status: string; atgard: string };
export type ImportState = {
  ok?: boolean;
  kind?: "hme" | "ekonomi" | "sjukfranvaro";
  message?: string;
  rader?: ImportRad[];
};

type JsonObject = Record<string, unknown>;
function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const text = (v: unknown): string => typeof v === "string" ? v : "–";

/** UI:t väljer endpoint; normalisering, dagsuttag och mätmetod ägs av backend. */
export async function importData(_prev: ImportState, formData: FormData): Promise<ImportState> {
  if (!(await isAdmin())) return { ok: false, message: "Behörighet saknas." };
  const token = process.env.IMPORT_TOKEN;
  if (!token) return { ok: false, message: "Import är inte aktiverad (IMPORT_TOKEN saknas)." };
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return { ok: false, message: "Välj en datafil." };
  if (files.length > 100 || files.reduce((sum, f) => sum + f.size, 0) > 15_000_000) {
    return { ok: false, message: "Välj högst 100 filer och sammanlagt 15 MB." };
  }
  const contents = await Promise.all(files.map(async (f) => ({ namn: f.name, text: await f.text() })));
  const csv = contents.map((f) => /^\uFEFF?Period[,\t]/.test(f.text));
  let path: string;
  let body: unknown;
  let kind: "hme" | "ekonomi" | "sjukfranvaro";
  if (csv.every(Boolean)) {
    const personal = contents.map((f) => /SK\.P\./.test(f.text));
    if (personal.some(Boolean) && !personal.every(Boolean)) {
      return { ok: false, message: "Ladda upp ekonomi och sjukfrånvaro var för sig." };
    }
    kind = personal.every(Boolean) ? "sjukfranvaro" : "ekonomi";
    path = `/api/import/${kind}-filer`;
    body = { filer: contents };
  } else {
    if (csv.some(Boolean)) return { ok: false, message: "Ladda upp CSV/TXT och JSON var för sig." };
    let reports: JsonObject[];
    try {
      const parsed: unknown[] = contents.map((f) => JSON.parse(f.text.replace(/^\uFEFF/, "")));
      if (!parsed.every(isObject)) throw new Error("object");
      reports = parsed;
    } catch {
      return { ok: false, message: "Filerna måste innehålla giltiga JSON-objekt eller Qlik-exporter." };
    }
    const first = reports[0];
    if (reports.length === 1 && Array.isArray(first.poster)) {
      kind = "ekonomi"; path = "/api/import/ekonomi"; body = first;
    } else if (reports.length === 1 && Array.isArray(first.forvaltningar)) {
      kind = "hme"; path = "/api/import/hme"; body = first;
    } else {
      const totals = reports.filter((r) => isObject(r.dimensioner));
      const perspectives = reports.filter((r) => isObject(r.perspektiv) && !isObject(r.dimensioner));
      if (totals.length !== 1 || perspectives.length > 1 || totals.length + perspectives.length !== reports.length) {
        return { ok: false, message: "Välj en HME-totalindexrapport och högst en delindexrapport." };
      }
      kind = "hme"; path = "/api/import/hme-rapport";
      body = { rapport: totals[0], delindex: perspectives[0] ?? null };
    }
  }
  try {
    const backend = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";
    const res = await fetch(`${backend}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(30_000),
    });
    const result: unknown = await res.json();
    if (!res.ok) {
      const detail = isObject(result) && typeof result.detail === "string" ? ` ${result.detail}` : "";
      return { ok: false, message: `Import misslyckades (HTTP ${res.status}).${detail}` };
    }
    if (!isObject(result)) return { ok: false, message: "Oväntat svar från tjänsten." };
    const rows = kind === "hme" ? result.forvaltningar : result.enheter;
    const labels = { hme: "HME", ekonomi: "Ekonomi", sjukfranvaro: "Sjukfrånvaro" };
    revalidatePath("/", "layout");
    return {
      ok: true, kind,
      message: `${labels[kind]} importerad: ${result.skapade} skapade, ${result.uppdaterade} uppdaterade, ${result.hoppade_over ?? 0} hoppade över.`,
      rader: Array.isArray(rows) ? rows.filter(isObject).map((r) => ({
        namn: text(r.namn), value: text(r.value), status: text(r.status), atgard: text(r.atgard),
      })) : [],
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    return { ok: false, message: name === "TimeoutError" || name === "AbortError"
      ? "Tjänsten svarade inte inom 30 sekunder. Importen kan ha gått igenom. Kontrollera värdena innan du försöker igen."
      : "Kunde inte läsa svaret från tjänsten. Kontrollera värdena innan du försöker igen." };
  }
}
