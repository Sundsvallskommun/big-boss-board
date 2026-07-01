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

/** En period i sjukfrånvarodiagrammet (etiketten är redan formaterad, t.ex. "T1 2026"). */
export interface SjukChartPunkt {
  period: string;
  total: number | null;
  kvinnor: number | null;
  man: number | null;
}

/** Seriefärger i kommunens palett (motsvarar beslutsstödets graf). */
const C = {
  total: "#157A47", // grön 700
  kvinnor: "#B9DCC6", // ljus grön (gronsta)
  man: "#6B3FA0", // lila 700
  grid: "#E5E5E5", // gray-200
  axis: "#51515C", // dark-secondary
};

const fmt = (v: number) => v.toFixed(1).replace(".", ",");

/** Total sjukfrånvaro (% av ordinarie arbetstid) som linje + kvinnors/mäns andel som staplar. */
export function SjukfranvaroChart({ data }: { data: SjukChartPunkt[] }) {
  const vals = data.flatMap((d) =>
    [d.total, d.kvinnor, d.man].filter((v): v is number => typeof v === "number"),
  );
  const ymax = Math.max(10, Math.ceil(Math.max(...vals, 0)));
  const label = { position: "top" as const, fontSize: 11, fill: C.axis, formatter: (v: number) => fmt(v) };

  return (
    <div className="h-[360px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 18, right: 16, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke={C.grid} strokeDasharray="3 3" />
          <XAxis dataKey="period" tick={{ fill: C.axis, fontSize: 12 }} axisLine={{ stroke: C.grid }} tickLine={false} />
          <YAxis
            domain={[0, ymax]}
            tick={{ fill: C.axis, fontSize: 12 }}
            tickFormatter={(v) => fmt(v)}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip formatter={(v: number, name) => [`${fmt(v)} %`, name]} />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />

          <Bar dataKey="kvinnor" name="Kvinnor andel i %" fill={C.kvinnor} maxBarSize={44}>
            <LabelList dataKey="kvinnor" {...label} />
          </Bar>
          <Bar dataKey="man" name="Män andel i %" fill={C.man} maxBarSize={44}>
            <LabelList dataKey="man" {...label} />
          </Bar>
          <Line dataKey="total" name="Totalt %" stroke={C.total} strokeWidth={2.5} dot={{ r: 4 }}>
            <LabelList dataKey="total" {...label} />
          </Line>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
