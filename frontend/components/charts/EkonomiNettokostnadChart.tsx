"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** En månads nettokostnadsmått (mnkr). Diagrammet ritar en stapelgrupp + budgetlinjer per
 *  månad — i dag finns bara senaste perioden, fler månader fylls på när månadsdata finns. */
export interface EkonomiManad {
  manad: string;
  budget_helar: number | null;
  budget_ack: number | null;
  utfall: number | null;
  utfall_fg: number | null;
  prognos: number | null;
  diff: number | null;
}

/** Seriefärger som SK CSS-variabler (motsvarar rapportens färgsättning — inga hårdkodade hex). */
const C = {
  budgetHelar: "var(--sk-colors-primitives-green-700)",
  budgetAck: "var(--sk-colors-gronsta-background-300)",
  utfall: "var(--sk-colors-primitives-purple-700)",
  utfallFg: "var(--sk-colors-primitives-purple-400)",
  prognos: "var(--sk-colors-primitives-blue-700)",
  diff: "var(--sk-colors-vattjom-background-300)",
  grid: "var(--sk-colors-primitives-gray-200)",
  axis: "var(--sk-colors-dark-secondary)",
};

const fmt = (v: number) =>
  (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace(".", ",");

export function EkonomiNettokostnadChart({ data }: { data: EkonomiManad[] }) {
  const vals = data.flatMap((d) =>
    [d.budget_helar, d.budget_ack, d.utfall, d.utfall_fg, d.prognos, d.diff].filter(
      (v): v is number => typeof v === "number",
    ),
  );
  const min = vals.length ? Math.min(...vals, 0) : -100;
  const low = Math.floor((min * 1.14) / 50) * 50;

  const label = { position: "bottom" as const, fontSize: 11, fill: C.axis, formatter: (v: number) => fmt(v) };

  return (
    <div className="h-[380px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} />
          <XAxis dataKey="manad" tick={{ fill: C.axis, fontSize: 12 }} axisLine={{ stroke: C.grid }} tickLine={false} />
          <YAxis
            domain={[low, 0]}
            tick={{ fill: C.axis, fontSize: 12 }}
            tickFormatter={(v) => fmt(v)}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip formatter={(v: number, name) => [`${fmt(v)} mnkr`, name]} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />

          <Bar dataKey="utfall" name="Ack utfall" fill={C.utfall} maxBarSize={34}>
            <LabelList dataKey="utfall" {...label} />
          </Bar>
          <Bar dataKey="utfall_fg" name="Ack utfall fg år" fill={C.utfallFg} maxBarSize={34}>
            <LabelList dataKey="utfall_fg" {...label} />
          </Bar>
          <Bar dataKey="prognos" name="Prognos" fill={C.prognos} maxBarSize={34}>
            <LabelList dataKey="prognos" {...label} />
          </Bar>
          <Bar dataKey="diff" name="Diff Budget/prognos" fill={C.diff} maxBarSize={34}>
            <LabelList dataKey="diff" {...label} position="top" />
          </Bar>

          <Line dataKey="budget_helar" name="Budget helår" stroke={C.budgetHelar} strokeWidth={2.5} dot={{ r: 4 }}>
            <LabelList dataKey="budget_helar" {...label} />
          </Line>
          <Line dataKey="budget_ack" name="Budget ack" stroke={C.budgetAck} strokeWidth={2.5} dot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
