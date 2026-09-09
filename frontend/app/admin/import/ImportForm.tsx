"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui";
import { UploadCloud, CheckCircle2, AlertTriangle } from "lucide-react";
import { STATUS } from "@/components/status";
import { importData, type ImportState } from "./actions";

export function ImportForm() {
  const [state, formAction, pending] = useActionState(importData, {} as ImportState);
  const [files, setFiles] = useState<File[]>([]);
  const tooLarge = files.length > 100 || files.reduce((sum, f) => sum + f.size, 0) > 15_000_000;
  return (
    <form action={formAction} className="space-y-16">
      <div className="rounded-12 border border-dashed border-hairline bg-background-200 p-24">
        <label htmlFor="file" className="block text-base font-semibold">Välj datafiler</label>
        <p id="import-help" className="mt-8 text-small text-dark-secondary">
          Välj ekonomi- eller personaluttag (CSV/TXT), eller HME-totalindex med valfri
          delindexrapport (JSON). Importera ett nyckeltal åt gången. Högst 100 filer och 15 MB.
        </p>
        <input id="file" name="file" type="file" multiple required
          accept=".json,.csv,.txt" aria-describedby="import-help import-selection"
          className="mt-16 block w-full rounded-4 text-small focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
        <p id="import-selection" aria-live="polite" className="mt-12 text-small text-dark-secondary">
          {tooLarge ? "Urvalet överstiger 100 filer eller 15 MB." : `${files.length} filer valda.`}
        </p>
      </div>
      <Button type="submit" color="vattjom" variant="primary" loading={pending}
        disabled={pending || tooLarge || files.length === 0} leftIcon={<UploadCloud size={16} aria-hidden="true" />}>
        Importera
      </Button>

      {state.ok ? (
        <div className={`rounded-12 p-16 ${state.incomplete
          ? "bg-warning-background-100 text-warning-text"
          : "bg-success-background-200 text-success-text"}`}>
          <p role="status" aria-live="polite" className="flex items-center gap-8 text-small font-semibold">
            {state.incomplete
              ? <AlertTriangle size={16} className="shrink-0" aria-hidden="true" />
              : <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />}
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
                            <span className="text-dark-secondary">Ingen bedömning</span>
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
