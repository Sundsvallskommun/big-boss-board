"use server";

import { isAdmin } from "@/lib/auth";

export type ImportRad = {
  namn: string;
  atgard: string;
  value: string;
  senaste_ar: number;
  trend: string;
  status: string;
  antal_svar: number | null;
  ar: string[];
};

export type ImportState = { ok?: boolean; message?: string; rader?: ImportRad[] };

/** Officiella rapporten (`dimensioner.Förvaltning`) → normaliserad importpayload.
 *  Accepterar även en redan normaliserad payload (innehåller `forvaltningar`). */
function toPayload(data: unknown): { forvaltningar: unknown[] } & Record<string, unknown> {
  const obj = (data ?? {}) as Record<string, any>;
  if (Array.isArray(obj.forvaltningar)) return obj as never;
  const dims = obj?.dimensioner ?? {};
  const forv = dims["Enhet"] ?? dims["Förvaltning"] ?? [];
  return {
    kpi: "hme",
    enhet: "index",
    mal: 75,
    kalla: "HME-mätning (officiell rapport)",
    forvaltningar: (forv as any[]).map((f) => ({
      namn: f.grupp,
      matningar: Object.fromEntries(
        Object.entries(f.matningar ?? {}).map(([k, v]) => [String(k), v]),
      ),
      antal_svar: f.antal_svar_2025 ?? null,
    })),
  };
}

export async function importHme(_prev: ImportState, formData: FormData): Promise<ImportState> {
  if (!(await isAdmin())) {
    return { ok: false, message: "Behörighet saknas." };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Välj en HME-fil (JSON)." };
  }

  let data: unknown;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return { ok: false, message: "Filen är inte giltig JSON." };
  }

  const payload = toPayload(data);
  if (!payload.forvaltningar.length) {
    return { ok: false, message: "Hittar inga förvaltningar i filen." };
  }

  const token = process.env.IMPORT_TOKEN;
  if (!token) {
    return { ok: false, message: "Import är inte aktiverad (IMPORT_TOKEN saknas)." };
  }

  const backend = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";
  let res: Response;
  try {
    res = await fetch(`${backend}/api/import/hme`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch {
    return { ok: false, message: "Kunde inte nå tjänsten. Försök igen." };
  }

  if (!res.ok) {
    return { ok: false, message: `Import misslyckades (HTTP ${res.status}).` };
  }

  const r = await res.json();
  return {
    ok: true,
    message: `Import klar: ${r.skapade} skapade, ${r.uppdaterade} uppdaterade (${r.forvaltningar.length} förvaltningar).`,
    rader: r.forvaltningar as ImportRad[],
  };
}
