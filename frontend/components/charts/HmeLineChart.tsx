"use client";

import { useId } from "react";
import { HME_WARNING_MARGIN, hmeStatus, STATUS } from "../status";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  usePlotArea,
  useYAxisScale,
} from "recharts";

/** Samma statuspalett som globals.css. Kurva, punkter och nivåkort har samma gränser. */
const C = {
  good: "#1E8A4E",
  warn: "#EAB308",
  alert: "#D32F2F",
  mal: "#51515C", // dark-secondary — mållinjen är kromdetalj, inte status
  grid: "#E5E5E5", // gray-200
  axis: "#51515C", // dark-secondary
};

export interface HmePoint {
  ar: string;
  value: number;
}

type DotProps = { cx?: number; cy?: number; payload?: HmePoint };

function HmeGradient({ id, target }: { id: string; target: number }) {
  const plot = usePlotArea();
  const scale = useYAxisScale();
  if (!plot?.height || !scale) return null;
  const targetY = scale(target);
  const warningY = scale(target - HME_WARNING_MARGIN);
  if (targetY === undefined || warningY === undefined) return null;
  const offset = (y: number) => Math.max(0, Math.min(1, (y - plot.y) / plot.height));
  return (
    <defs>
      <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={0} x2={0} y1={plot.y} y2={plot.y + plot.height}>
        <stop offset={offset(targetY)} stopColor={C.good} />
        <stop offset={offset(targetY)} stopColor={C.warn} />
        <stop offset={offset(warningY)} stopColor={C.warn} />
        <stop offset={offset(warningY)} stopColor={C.alert} />
      </linearGradient>
    </defs>
  );
}

export function HmeLineChart({ data, target }: { data: HmePoint[]; target: number }) {
  const gradientId = useId().replace(/:/g, "") + "-hme";
  if (data.length === 0) return null;

  const vals = data.map((d) => d.value);
  const lo = Math.max(0, Math.floor((Math.min(...vals, target) - 6) / 10) * 10);
  const hi = Math.min(100, Math.ceil((Math.max(...vals, target) + 6) / 10) * 10);
  const lastAr = data[data.length - 1].ar;

  /** Mörk kant gör även de gula punkterna tydliga mot vitt. */
  function renderDot(props: DotProps, active = false) {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload) return <g key="tom" />;
    const isLast = payload.ar === lastAr;
    return (
      <circle
        key={payload.ar}
        cx={cx}
        cy={cy}
        r={active ? 7 : isLast ? 6 : 4.5}
        fill={C[hmeStatus(payload.value, target)]}
        stroke={C.axis}
        strokeWidth={1}
      />
    );
  }

  return (
    <div>
      <p className="mb-8 text-small text-dark-secondary">
        Grönt från {target}, gult från {target - HME_WARNING_MARGIN} till under {target}, rött under {target - HME_WARNING_MARGIN}.
      </p>
      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 24, right: 28, bottom: 8, left: 0 }}>
            <HmeGradient id={gradientId} target={target} />
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
              formatter={(v) => [typeof v === "number" ? `${String(v).replace(".", ",")} · ${STATUS[hmeStatus(v, target)].legend}` : "–", "HME-index"]}
              labelFormatter={(l) => `År ${l}`}
              contentStyle={{ borderRadius: 12, border: `1px solid ${C.grid}`, fontSize: 13 }}
            />
            <ReferenceLine y={target - HME_WARNING_MARGIN} stroke={C.mal} strokeDasharray="2 6" />
            <ReferenceLine
              y={target}
              stroke={C.mal}
              strokeDasharray="6 6"
              label={{ value: `Mål ${target}`, position: "right", fill: C.axis, fontSize: 13 }}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={C.axis}
              strokeWidth={5}
              dot={false}
              activeDot={false}
              tooltipType="none"
              legendType="none"
              isAnimationActive={false}
            />
            {/* Kontrastkonturen ovan gör den gula delen synlig mot vitt. */}
            <Line
              type="monotone"
              dataKey="value"
              stroke={`url(#${gradientId})`}
              strokeWidth={3}
              dot={(props: DotProps) => renderDot(props)}
              activeDot={(props: DotProps) => renderDot(props, true)}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
