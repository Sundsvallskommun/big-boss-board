"use server";

import { isAdmin } from "@/lib/auth";

export type ImportRad = {
  namn: string;
  value: string;
  status: string;
  atgard: string;
};

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

function asText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : value == null ? fallback : String(value);
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Officiella HME-rapporten (`dimensioner.Enhet/Förvaltning`) → normaliserad payload.
 *  Accepterar även en redan normaliserad payload (innehåller `forvaltningar`). */
function hmeToPayload(obj: JsonObject): { forvaltningar: unknown[] } & JsonObject {
  if (Array.isArray(obj.forvaltningar)) {
    return obj as { forvaltningar: unknown[] } & JsonObject;
  }
  const dims = isObject(obj.dimensioner) ? obj.dimensioner : {};
  const forv = asArray(dims["Enhet"] ?? dims["Förvaltning"]);
  return {
    kpi: "hme",
    enhet: "index",
    mal: 75,
    kalla: "HME-mätning (officiell rapport)",
    forvaltningar: forv.filter(isObject).map((f) => ({
      namn: asText(f.grupp),
      matningar: Object.fromEntries(
        Object.entries(isObject(f.matningar) ? f.matningar : {}).map(([k, v]) => [String(k), v]),
      ),
      antal_svar: typeof f.antal_svar_2025 === "number" ? f.antal_svar_2025 : null,
    })),
  };
}

async function postBody(path: string, body: string, contentType: string): Promise<Response | null> {
  const token = process.env.IMPORT_TOKEN;
  if (!token) return null;
  const backend = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";
  try {
    return await fetch(`${backend}${path}`, {
      method: "POST",
      headers: { "Content-Type": contentType, Authorization: `Bearer ${token}` },
      body,
      cache: "no-store",
    });
  } catch {
    return null;
  }
}

function ekonomiRader(enheter: unknown[]): ImportRad[] {
  return enheter.filter(isObject).map((e) => ({
    namn: asText(e.namn),
    value: asText(e.value, "–"),
    status: asText(e.status),
    atgard: asText(e.atgard),
  }));
}

/** Tar emot HME (JSON), ekonomi (JSON) eller ekonomi (CSV) och postar till rätt endpoint. */
export async function importData(_prev: ImportState, formData: FormData): Promise<ImportState> {
  if (!(await isAdmin())) {
    return { ok: false, message: "Behörighet saknas." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Välj en datafil (JSON eller CSV)." };
  }
  if (!process.env.IMPORT_TOKEN) {
    return { ok: false, message: "Import är inte aktiverad (IMPORT_TOKEN saknas)." };
  }

  const text = await file.text();

  // Qlik CSV-export: rå CSV postas och normaliseras server-side. Personal (SK.P.*) →
  // sjukfrånvaro, RR (SK.EK.*) → ekonomi.
  const isCsv = file.name.toLowerCase().endsWith(".csv") || /^﻿?Period,Enhet,M/.test(text);
  if (isCsv) {
    const personal = /SK\.P\./.test(text);
    const path = personal ? "/api/import/sjukfranvaro-csv" : "/api/import/ekonomi-csv";
    const etikett = personal ? "Sjukfrånvaro" : "Ekonomi";
    const res = await postBody(path, text, "text/csv");
    if (!res) return { ok: false, message: "Kunde inte nå tjänsten. Försök igen." };
    if (!res.ok) return { ok: false, message: `Import misslyckades (HTTP ${res.status}).` };
    const r = (await res.json()) as JsonObject;
    return {
      ok: true,
      kind: personal ? "sjukfranvaro" : "ekonomi",
      message: `${etikett}-import (CSV) klar: ${r.skapade} skapade, ${r.uppdaterade} uppdaterade, ${r.hoppade_over} hoppade över.`,
      rader: ekonomiRader(asArray(r.enheter)),
    };
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, message: "Filen är varken giltig JSON eller en igenkänd CSV." };
  }
  if (!isObject(data)) {
    return { ok: false, message: "JSON-filen måste innehålla ett objekt." };
  }

  // Ekonomi JSON (rå rapport med poster/dataset).
  if (Array.isArray(data.poster) || data.dataset) {
    if (!Array.isArray(data.poster) || data.poster.length === 0) {
      return { ok: false, message: "Hittar inga poster i ekonomifilen." };
    }
    const res = await postBody("/api/import/ekonomi", JSON.stringify(data), "application/json");
    if (!res) return { ok: false, message: "Kunde inte nå tjänsten. Försök igen." };
    if (!res.ok) return { ok: false, message: `Import misslyckades (HTTP ${res.status}).` };
    const r = (await res.json()) as JsonObject;
    return {
      ok: true,
      kind: "ekonomi",
      message: `Ekonomi-import klar: ${r.skapade} skapade, ${r.uppdaterade} uppdaterade, ${r.hoppade_over} hoppade över.`,
      rader: ekonomiRader(asArray(r.enheter)),
    };
  }

  // HME (JSON).
  const payload = hmeToPayload(data);
  if (!payload.forvaltningar.length) {
    return { ok: false, message: "Hittar inga förvaltningar i filen." };
  }
  const res = await postBody("/api/import/hme", JSON.stringify(payload), "application/json");
  if (!res) return { ok: false, message: "Kunde inte nå tjänsten. Försök igen." };
  if (!res.ok) return { ok: false, message: `Import misslyckades (HTTP ${res.status}).` };
  const r = (await res.json()) as JsonObject;
  return {
    ok: true,
    kind: "hme",
    message: `HME-import klar: ${r.skapade} skapade, ${r.uppdaterade} uppdaterade (${asArray(r.forvaltningar).length} förvaltningar).`,
    rader: asArray(r.forvaltningar).filter(isObject).map((f) => ({
      namn: asText(f.namn),
      value: asText(f.value),
      status: asText(f.status),
      atgard: asText(f.atgard),
    })),
  };
}
