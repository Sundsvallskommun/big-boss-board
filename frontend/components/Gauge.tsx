/** Bespoke sammanvägd mätare (finns ej i SK) — byggd med designtokens, ingen hex.
 *  `level` 0..1 = andel områden i mål; styr nålens vinkel över röd→gul→grön-bågen. */
export function Gauge({ level, label, hint }: { level: number; label: string; hint: string }) {
  const cx = 110;
  const cy = 110;
  const r = 68;
  // 180° (vänster, röd) vid level 0 → 0° (höger, grön) vid level 1.
  const angle = Math.PI * (1 - Math.min(1, Math.max(0, level)));
  const nx = cx + r * Math.cos(angle);
  const ny = cy - r * Math.sin(angle);

  return (
    <div className="flex shrink-0 flex-col items-center md:border-l md:border-hairline md:pl-7">
      <svg
        viewBox="0 0 220 132"
        width="200"
        height="120"
        role="img"
        aria-label={`Sammanvägd status: ${label}`}
      >
        <path
          d="M20 110 A90 90 0 0 1 52.7 40.7"
          className="stroke-error"
          fill="none"
          strokeWidth={15}
        />
        <path
          d="M52.7 40.7 A90 90 0 0 1 167.3 40.7"
          className="stroke-warning"
          fill="none"
          strokeWidth={15}
        />
        <path
          d="M167.3 40.7 A90 90 0 0 1 200 110"
          className="stroke-success"
          fill="none"
          strokeWidth={15}
        />
        <line
          x1={cx}
          y1={cy}
          x2={nx}
          y2={ny}
          className="stroke-dark-primary"
          strokeWidth={3.5}
          strokeLinecap="round"
        />
        <circle cx={cx} cy={cy} r={7} className="fill-dark-primary" />
        <circle cx={cx} cy={cy} r={3} className="fill-white" />
      </svg>
      <div className="-mt-1 text-center">
        <div className="text-small font-semibold">{label}</div>
        <div className="eyebrow-sm mt-0.5">{hint}</div>
      </div>
    </div>
  );
}
