"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { UploadCloud, CheckCircle2, AlertTriangle } from "lucide-react";
import { STATUS } from "@/components/status";
import { importData, type ImportState } from "./actions";

type Preview =
  | { kind: "hme" | "ekonomi" | "sjukfranvaro"; count: number; info: string }
  | { error: string }
  | null;

const KIND_ETIKETT: Record<"hme" | "ekonomi" | "sjukfranvaro", string> = {
  hme: "HME",
  ekonomi: "Ekonomi",
  sjukfranvaro: "Sjukfrånvaro",
};

function previewOf(text: string): Preview {
  // Ekonomi CSV (Qlik-export): Period,Enhet,Mått,Kolumn,Mätvärde (ev. BOM).
  if (/^﻿?Period,Enhet,M/.test(text)) {
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const enheter = new Set<string>();
    let period = "";
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const kod = (cols[1] ?? "").trim();
      if (kod && kod !== "13") enheter.add(kod);
      if (!period) period = (cols[0] ?? "").trim();
    }
    if (enheter.size === 0) return { error: "Hittar inga enheter i CSV-filen." };
    const kind = /SK\.P\./.test(text) ? "sjukfranvaro" : "ekonomi";
    return { kind, count: enheter.size, info: period ? `period ${period} · CSV` : "CSV" };
  }
  try {
    const d = JSON.parse(text);
    // Ekonomi: rå rapport med poster/dataset.
    if (Array.isArray(d?.poster) || d?.dataset) {
      const enheter = (d?.metadata?.enheter ?? []).filter((e: any) => e?.niva === "förvaltning");
      const period = d?.dataset?.period ?? "";
      return { kind: "ekonomi", count: enheter.length, info: period ? `period ${period}` : "ekonomi" };
    }
    // HME: dimensioner eller redan normaliserad forvaltningar.
    const forv = Array.isArray(d?.forvaltningar)
      ? d.forvaltningar
      : d?.dimensioner?.["Enhet"] ?? d?.dimensioner?.["Förvaltning"] ?? [];
    if (!Array.isArray(forv) || forv.length === 0) return { error: "Hittar inga förvaltningar i filen." };
    const ar = new Set<string>();
    for (const f of forv) for (const y of Object.keys(f.matningar ?? {})) ar.add(y);
    const sorted = [...ar].sort();
    const span = sorted.length ? `${sorted[0]}–${sorted[sorted.length - 1]}` : "–";
    return { kind: "hme", count: forv.length, info: `år ${span}` };
  } catch {
    return { error: "Filen är varken giltig JSON eller CSV." };
  }
}

export function ImportForm() {
  const [state, formAction, pending] = useActionState(importData, {} as ImportState);
  const [preview, setPreview] = useState<Preview>(null);

  return (
    <form action={formAction} className="space-y-16">
      <div>
        <label
          htmlFor="file"
          className="flex cursor-pointer flex-col items-center gap-8 rounded-12 border border-dashed border-hairline bg-background-200 px-16 py-32 text-center transition hover:border-vattjom-surface-primary"
        >
          <UploadCloud size={28} className="text-vattjom-text-primary" aria-hidden="true" />
          <span className="text-base font-semibold">Välj datafil (JSON eller CSV)</span>
          <span className="text-small text-dark-secondary">
            HME-totalindex (JSON) eller ekonomi (JSON/CSV) — typen känns igen automatiskt
          </span>
        </label>
        <input
          id="file"
          name="file"
          type="file"
          accept="application/json,.json,text/csv,.csv"
          required
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setPreview(f ? previewOf(await f.text()) : null);
          }}
        />
      </div>

      {preview && (
        <p className="text-small" aria-live="polite">
          {"error" in preview ? (
            <span className="text-status-alert">{preview.error}</span>
          ) : (
            <span className="text-dark-secondary">
              {KIND_ETIKETT[preview.kind]} · {preview.count} förvaltningar · {preview.info}
            </span>
          )}
        </p>
      )}

      <Button
        type="submit"
        color="vattjom"
        variant="primary"
        loading={pending}
        disabled={pending || (preview != null && "error" in preview)}
        leftIcon={<UploadCloud size={16} aria-hidden="true" />}
      >
        Importera
      </Button>

      {state.ok ? (
        <div className="rounded-12 bg-success-background-200 p-16 text-success-text">
          <p role="status" aria-live="polite" className="flex items-center gap-8 text-small font-semibold">
            <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
            {state.message}
          </p>

          {state.rader && state.rader.length > 0 && (
            <div className="mt-12 overflow-x-auto">
              <table className="w-full border-collapse text-small">
                <thead>
                  <tr className="border-b border-white">
                    <th className="eyebrow-sm px-12 py-10 text-left">Förvaltning</th>
                    <th className="eyebrow-sm px-12 py-10 text-right">Värde</th>
                    <th className="eyebrow-sm px-12 py-10 text-left">Status</th>
                    <th className="eyebrow-sm px-12 py-10 text-left">Åtgärd</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white text-dark-primary">
                  {state.rader.map((r) => {
                    const s = STATUS[r.status as keyof typeof STATUS];
                    return (
                      <tr key={r.namn}>
                        <td className="px-12 py-10 font-semibold">{r.namn}</td>
                        <td className="px-12 py-10 text-right font-header font-bold tabular-nums">{r.value}</td>
                        <td className="px-12 py-10">
                          {s ? (
                            <span className="inline-flex items-center gap-6 whitespace-nowrap">
                              <span className={`inline-block h-8 w-8 shrink-0 rounded-full ${s.solid}`} aria-hidden="true" />
                              {s.legend}
                            </span>
                          ) : (
                            <span className="text-dark-secondary">–</span>
                          )}
                        </td>
                        <td className="px-12 py-10 font-mono text-dark-secondary">{r.atgard}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : state.message ? (
        <p
          role="status"
          aria-live="polite"
          className="flex items-start gap-8 rounded-12 bg-error-background-200 p-16 text-small text-error-text"
        >
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
