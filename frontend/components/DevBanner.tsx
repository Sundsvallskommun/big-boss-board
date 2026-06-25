import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Sidövergripande meddelande om att tjänsten är under utveckling, med länk till /status.
 *  Ljusgrön yta via SK:s success-tokens (inga hårdkodade hex). Renderas i root-layouten. */
export function DevBanner() {
  return (
    <div
      role="region"
      aria-label="Utvecklingsmeddelande"
      className="border-b border-success-background-300 bg-success-background-200"
    >
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-center gap-x-12 gap-y-8 px-24 py-10 text-center md:px-32">
        <p className="text-small font-medium text-dark-primary">
          Tjänsten är under utveckling — innehåll och funktioner kan komma att ändras.
        </p>
        <Link
          href="/status"
          className="inline-flex items-center gap-6 rounded-full border border-success-background-300 bg-background-content px-12 py-4 text-small font-semibold text-dark-primary transition hover:border-dark-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Följ arbetet med statusen
          <ArrowRight size={14} strokeWidth={2.2} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
