"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

import { STATUS } from "./status";
import type { Status } from "@/lib/api";

/** HME-talet byggs av tre delperspektiv. Totalen ligger först eftersom det är den
 *  rubriksiffran på kortet visar — de tre förklarar vad den består av. Nycklarna är
 *  desamma som i `details.perspektiv` och i backends PERSPEKTIV. */
const NIVAER = [
  { key: "total", label: "Totalt" },
  { key: "motivation", label: "Motivation" },
  { key: "ledarskap", label: "Ledarskap" },
  { key: "styrning", label: "Styrning" },
] as const;

type Nivakey = (typeof NIVAER)[number]["key"];

const HmeLineChart = dynamic(() => import("./charts/HmeLineChart").then((m) => m.HmeLineChart), {
  ssr: false,
  loading: () => <div className="h-[320px] w-full animate-pulse rounded-12 bg-background-200" aria-hidden="true" />,
});

/** Färgnivå för ett HME-värde mot målet. Måste hållas i synk med backends hme_status():
 *  grön på eller över målet, gul inom 5 procentenheter under, annars röd. Delkorten sätter
 *  färgen själva — backend statusmärker bara totalen, medan varje perspektiv har sitt eget
 *  värde och kan ligga på en helt annan nivå (Miljökontoret: motivation 73, ledarskap 91). */
function hmeStatus(value: number, mal: number): Status {
  if (value >= mal) return "good";
  if (value >= mal - 5) return "warn";
  return "alert";
}

/** Heltal utan decimal, annars en svensk decimal: 78 → "78", 78.5 → "78,5". */
const visa = (v: number) =>
  (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace(".", ",");

interface Serie {
  key: Nivakey;
  label: string;
  /** Mätår → värde, stigande. Tom serie förekommer inte — nivån utelämnas då helt. */
  punkter: { ar: string; value: number }[];
}

function tillSerie(matningar: Record<string, number> | undefined): { ar: string; value: number }[] {
  if (!matningar) return [];
  return Object.keys(matningar)
    .sort()
    .map((ar) => ({ ar, value: matningar[ar] }))
    .filter((p) => typeof p.value === "number");
}

/** Trendtext mot föregående mätår. HME mäts vartannat år, så "sedan 2023" säger mer än
 *  "sedan förra mätningen" — läsaren behöver veta hur långt tillbaka jämförelsen går. */
function trend(punkter: { ar: string; value: number }[]): string | null {
  if (punkter.length < 2) return null;
  const sist = punkter[punkter.length - 1];
  const forra = punkter[punkter.length - 2];
  const diff = Math.round((sist.value - forra.value) * 10) / 10;
  if (diff === 0) return `Oförändrat sedan ${forra.ar}`;
  return `${diff > 0 ? "+" : "−"}${visa(Math.abs(diff))} sedan ${forra.ar}`;
}

/**
 * HME-kortets nivåindelning: välj Totalt eller ett delperspektiv, se dess kurva.
 *
 * Panelen öppnar utan graf. Fyra kurvor ovanpå varandra hade blivit oläsliga, och tre av
 * dem svarar på en annan fråga än den rubriksiffran ställer — därför väljer man nivå
 * först. Är inget valt visas bara nivåkorten med sitt senaste värde och sin trend, vilket
 * i sig är en sammanfattning: man ser var perspektiven ligger utan att öppna något.
 *
 * Saknar rapporten delperspektiv finns bara totalen kvar. Då är en nivåväljare med ett
 * enda val bara i vägen, och grafen ritas direkt som förut.
 */
export function HmeNivaer({
  matningar,
  perspektiv,
  target,
}: {
  matningar?: Record<string, number>;
  perspektiv?: Record<string, Record<string, number>> | null;
  target: number;
}) {
  const [vald, setVald] = useState<Nivakey | null>(null);

  const serier: Serie[] = NIVAER.map((n) => ({
    key: n.key,
    label: n.label,
    punkter: tillSerie(n.key === "total" ? matningar : perspektiv?.[n.key]),
  })).filter((s) => s.punkter.length > 0);

  if (serier.length === 0) return null;

  // Bara totalen → ingen nivå att välja mellan. Rita kurvan direkt i stället för att
  // gömma den bakom ett ensamt kort.
  if (serier.length === 1) {
    return <HmeLineChart data={serier[0].punkter} target={target} />;
  }

  const aktiv = serier.find((s) => s.key === vald) ?? null;

  return (
    <div>
      <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
        {serier.map((s) => {
          const sist = s.punkter[s.punkter.length - 1];
          const t = trend(s.punkter);
          const isSel = s.key === vald;
          const st = STATUS[hmeStatus(sist.value, target)];
          return (
            <button
              key={s.key}
              type="button"
              // Ett andra klick fäller ihop igen, så man tar sig tillbaka till översikten
              // utan att leta efter en stängknapp.
              onClick={() => setVald(isSel ? null : s.key)}
              aria-pressed={isSel}
              aria-controls="hme-niva-graf"
              // Samma anatomi som KPI-korten högst upp på sidan — statusremsa, mjuk
              // statusyta, rubrik, tal — men i mindre skala och utan ikonbricka, så att de
              // läses som en nivå under och inte som ännu en rad huvudkort.
              className={`flex flex-col overflow-hidden rounded-12 border text-left transition hover:-translate-y-2 hover:border-dark-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${st.soft} ${
                isSel ? "border-vattjom-surface-primary card-selected" : "border-hairline"
              }`}
            >
              <span className={`h-3 w-full ${st.solid}`} aria-hidden="true" />
              <span className="flex h-full flex-col gap-8 p-14">
                <span className="text-base font-semibold leading-tight tracking-tight">
                  {s.label}
                </span>
                <span className="block">
                  <span className="block font-header text-h3 font-bold leading-none tracking-tight tabular-nums">
                    {visa(sist.value)}
                  </span>
                  <span className="mt-4 block text-small leading-snug text-dark-secondary">
                    {t ?? `Endast ${sist.ar}`}
                  </span>
                </span>
                <span className={`eyebrow-sm mt-auto flex items-center gap-6 ${st.text}`}>
                  <span className={`inline-block h-8 w-8 shrink-0 rounded-full ${st.solid}`} aria-hidden="true" />
                  {st.legend}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div id="hme-niva-graf">
        {aktiv ? (
          <div className="mt-16">
            <div className="eyebrow-sm mb-8">
              {aktiv.label} · {aktiv.punkter[0].ar}–{aktiv.punkter[aktiv.punkter.length - 1].ar}
            </div>
            {/* key gör att grafen monteras om vid byte av nivå — annars animerar Recharts
                mellan två serier som inte hör ihop. */}
            <HmeLineChart key={aktiv.key} data={aktiv.punkter} target={target} />
          </div>
        ) : (
          <p className="mt-12 text-small text-dark-secondary">
            Välj Totalt eller ett delperspektiv ovan för att se utvecklingen över tid.
          </p>
        )}
      </div>
    </div>
  );
}
