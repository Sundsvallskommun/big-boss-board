import type { Status } from "@/lib/api";
import { STATUS } from "./status";

/** Horisontell fördelningsstapel: visar hur nyckeltalen fördelar sig på status.
 *  Ersätter den tidigare dekorativa gauge-nålen. */
const ORDER: Status[] = ["good", "warn", "alert"];
const ETIKETT: Record<Status, string> = { good: "över mål", warn: "bevaka", alert: "åtgärd" };

export function StatusFordelning({
  counts,
  total,
  label,
}: {
  counts: Record<Status, number>;
  total: number;
  label: string;
}) {
  const t = total || 1;

  return (
    <div
      className="flex shrink-0 flex-col gap-12 md:border-l md:border-hairline md:pl-28"
      style={{ minWidth: 260 }}
    >
      <div className="eyebrow-sm">Sammanvägd status · {total} nyckeltal</div>
      <div className="font-header text-[28px] font-bold leading-none text-dark-primary">{label}</div>

      {/* Segmenterad stapel — bredd efter antal i varje status */}
      <div className="flex h-10 w-full overflow-hidden rounded-full" aria-hidden="true">
        {ORDER.map((s) =>
          counts[s] > 0 ? (
            <span key={s} className={STATUS[s].solid} style={{ width: `${(counts[s] / t) * 100}%` }} />
          ) : null,
        )}
      </div>

      {/* Teckenförklaring med antal */}
      <div className="flex flex-wrap gap-x-16 gap-y-4">
        {ORDER.map((s) => (
          <span key={s} className="eyebrow-sm flex items-center gap-6">
            <span className={`inline-block h-8 w-8 rounded-full ${STATUS[s].solid}`} aria-hidden="true" />
            {counts[s]} {ETIKETT[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
