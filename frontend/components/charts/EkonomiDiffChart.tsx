"use client";

import type { TooltipProps } from "recharts";

import {
  Bar,
  BarChart,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** En månads diff budget–prognos (mnkr). Negativt = prognosen pekar mot underskott. */
export interface EkonomiDiffManad {
  manad: string;
  diff: number | null;
  /** Manuellt korrigerad punkt — märks med * vid värdet och förklaras i faktarutan. */
  korrigerad?: boolean;
}

/** Budgetlinjen är nollan: staplar under den betyder underskott, över den överskott.
 *  Färgen förstärker tecknet som läget redan visar — den bär det aldrig ensam. */
const C = {
  under: "#D32F2F", // status-alert
  over: "#1E8A4E", // status-good
  noll: "#1F1F25", // dark-primary — budgetlinjen ska läsas som referens, inte som grid
  axis: "#51515C",
};

const R = 4; // rundad hörnradie i stapelns dataände
const MIN_H = 3; // en månad i balans ska synas som en markering på linjen

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1)).replace(".", ",");
const signerad = (v: number) => (v > 0 ? `+${fmt(v)}` : v < 0 ? `−${fmt(Math.abs(v))}` : "±0");

/** En stapel per månad — uppåt vid överskott, nedåt vid underskott.
 *
 *  Egen form i stället för `radius`: rundningen ska sitta i stapelns **dataände** och
 *  den kvadratiska kanten mot budgetlinjen. Recharts `radius` rundar alltid samma hörn,
 *  vilket för en nedåtgående stapel hamnar fel — vid baslinjen. Formen sätter också
 *  en minsta höjd, så att "i balans" (0) syns som en markering på linjen och inte som
 *  ingenting alls. Månader utan underlag får `null` och ritas inte.
 */
type StapelProps = { x?: unknown; y?: unknown; width?: unknown; height?: unknown; value?: unknown; korrigerad?: boolean };
function Stapel(props: StapelProps = {}) {
  const { x, y, width, height, value } = props;
  if (typeof value !== "number" || typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number") return null;

  const negativ = value < 0;
  // Recharts ger `y` vid stapelns DATAÄNDE och en `height` med tecken — negativ för
  // en nedåtgående stapel. Budgetlinjen ligger därför alltid vid y + height, åt båda
  // hållen. (Verifierat mot recharts utdata; antar man y = nollinjen hamnar staplarna
  // löst svävande en bit från linjen.)
  const noll = y + height;
  const hojd = Math.max(Math.abs(height), MIN_H);
  const topp = negativ ? noll : noll - hojd;
  const botten = negativ ? noll + hojd : noll;
  const r = Math.min(R, hojd, width / 2);

  const d = negativ
    ? // dataänden nedåt
      `M${x},${topp} L${x},${botten - r} Q${x},${botten} ${x + r},${botten} ` +
      `L${x + width - r},${botten} Q${x + width},${botten} ${x + width},${botten - r} ` +
      `L${x + width},${topp} Z`
    : // dataänden uppåt
      `M${x},${botten} L${x},${topp + r} Q${x},${topp} ${x + r},${topp} ` +
      `L${x + width - r},${topp} Q${x + width},${topp} ${x + width},${topp + r} ` +
      `L${x + width},${botten} Z`;

  return <path d={d} fill={negativ ? C.under : C.over} />;
}

/** Etiketten hör till stapelns dataände: ovanför en uppåtgående, under en nedåtgående. */
function Etikett(props: StapelProps = {}) {
  const { x, y, width, height, value, korrigerad } = props;
  if (typeof value !== "number" || typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number") return null;
  const negativ = value < 0;
  const noll = y + height; // samma invariant som i Stapel
  const hojd = Math.max(Math.abs(height), MIN_H);
  const anda = negativ ? noll + hojd : noll - hojd;
  return (
    <text
      x={x + width / 2}
      y={negativ ? anda + 14 : anda - 6}
      textAnchor="middle"
      fontSize={11}
      fill={C.axis}
    >
      {signerad(value)}
      {korrigerad ? "*" : ""}
    </text>
  );
}

function Tips({ active, payload, label }: TooltipProps<number, string>) {
  const v = payload?.[0]?.value;
  if (!active || typeof v !== "number") return null;
  const ord = v < 0 ? "Mot underskott" : v > 0 ? "Mot överskott" : "I balans";
  const korrigerad = payload?.[0]?.payload?.korrigerad;
  return (
    <div className="rounded-8 border border-hairline bg-background-content px-12 py-8 text-small shadow-sm">
      <p className="font-semibold">{label}</p>
      <p className="tabular-nums">
        {signerad(v)} mnkr · {ord}
      </p>
      {korrigerad && (
        <p className="mt-4 text-dark-secondary">Manuellt korrigerad — se faktarutan.</p>
      )}
    </div>
  );
}

export function EkonomiDiffChart({ data }: { data: EkonomiDiffManad[] }) {
  const varden = data.map((d) => d.diff).filter((v): v is number => typeof v === "number");
  // Symmetrisk skala runt noll → lika stora avvikelser blir lika långa staplar.
  const storst = Math.max(10, ...varden.map((v) => Math.abs(v)));
  const grans = Math.ceil((storst * 1.3) / 10) * 10;

  return (
    <div className="h-[340px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 16, bottom: 4, left: 0 }}>
          <XAxis
            dataKey="manad"
            tick={{ fill: C.axis, fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            interval={0}
            height={28}
          />
          <YAxis
            domain={[-grans, grans]}
            tick={{ fill: C.axis, fontSize: 12 }}
            tickFormatter={(v) => fmt(v)}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} content={<Tips />} />

          {/* Budget = noll. Stapeln byggs upp från den här linjen. */}
          <ReferenceLine
            y={0}
            stroke={C.noll}
            strokeWidth={2}
            label={{ value: "Budget", position: "insideTopLeft", fill: C.axis, fontSize: 11, dy: -6 }}
          />

          <Bar dataKey="diff" name="Diff budget–prognos" maxBarSize={38} shape={<Stapel />}>
            <LabelList
              dataKey="diff"
              content={(props) => (
                <Etikett {...props} korrigerad={data[Number(props.index)]?.korrigerad} />
              )}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
