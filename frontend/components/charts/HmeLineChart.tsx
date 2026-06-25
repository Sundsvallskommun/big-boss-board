"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";

/** Färger som SK CSS-variabler (injiceras globalt av getThemeCss) — inga nya hex
 *  utöver status-warn (samma medvetna gula avsteg som i tailwind.config). */
const C = {
  vattjom: "var(--sk-colors-vattjom-surface-primary-DEFAULT)",
  good: "var(--sk-colors-success-surface-primary-DEFAULT)",
  alert: "var(--sk-colors-error-surface-primary-DEFAULT)",
  warn: "#EAB308",
  grid: "var(--sk-colors-primitives-gray-200)",
  axis: "var(--sk-colors-dark-secondary)",
};

export interface HmePoint {
  ar: string;
  value: number;
}

type DotProps = { cx?: number; cy?: number; payload?: HmePoint };

export function HmeLineChart({ data, target }: { data: HmePoint[]; target: number }) {
  if (data.length === 0) return null;

  const vals = data.map((d) => d.value);
  const lo = Math.max(0, Math.floor((Math.min(...vals, target) - 6) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(...vals, target) + 6) / 10) * 10);
  const lastAr = data[data.length - 1].ar;

  /** Punkt färgad efter mål: grön över, röd under; senaste punkten större. */
  function renderDot(props: DotProps) {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload) return <g key="tom" />;
    const over = payload.value >= target;
    const isLast = payload.ar === lastAr;
    return (
      <circle
        key={payload.ar}
        cx={cx}
        cy={cy}
        r={isLast ? 6 : 4.5}
        fill={over ? C.good : C.alert}
        stroke="#fff"
        strokeWidth={2}
      />
    );
  }

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 24, right: 28, bottom: 8, left: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis
            dataKey="ar"
            tick={{ fill: C.axis, fontSize: 13 }}
            tickLine={false}
            axisLine={{ stroke: C.grid }}
          />
          <YAxis
            domain={[lo, hi]}
            tick={{ fill: C.axis, fontSize: 13 }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            formatter={(v: number) => [`${v}`, "HME-index"]}
            labelFormatter={(l) => `År ${l}`}
            contentStyle={{ borderRadius: 12, border: `1px solid ${C.grid}`, fontSize: 13 }}
          />
          <ReferenceLine
            y={target}
            stroke={C.warn}
            strokeDasharray="6 6"
            label={{ value: `Mål ${target}`, position: "right", fill: C.warn, fontSize: 13 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke={C.vattjom}
            strokeWidth={3}
            dot={renderDot}
            activeDot={{ r: 7 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
