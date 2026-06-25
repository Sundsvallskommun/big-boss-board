import type { Status } from "@/lib/api";
import { STATUS } from "./status";

/** Färgnivåerna för sjukfrånvaro (tröskelvärden). Visas i en popover bakom i-ikonen
 *  i dialogpanelen. Måste hållas i synk med backends sjukfranvaro_status()
 *  (SJUK_MAL = 6,0 · gul-tak = 7,5 · kvartalslarm = 1,5). */
const NIVAER: { status: Status; namn: string; trosk: string; text: string }[] = [
  {
    status: "good",
    namn: "Följa planen",
    trosk: "≤ 6,0 %",
    text: "Sjukfrånvaron ligger på eller under målet. Fortsätt det ordinarie hälsofrämjande arbetet.",
  },
  {
    status: "warn",
    namn: "Reagera",
    trosk: "6,1–7,5 %",
    text: "Stiger eller ligger stabilt strax över målet. Analysera mönster — t.ex. korttids- kontra långtidsfrånvaro.",
  },
  {
    status: "alert",
    namn: "Agera",
    trosk: "> 7,5 % (eller ökning > 1,5 p.e. på ett kvartal)",
    text: "Nivån är kritiskt hög eller ökar oroväckande snabbt. Starta skarpa, strukturerade åtgärder omedelbart.",
  },
];

export function SjukfranvaroNivaer() {
  return (
    <>
      <p>Färgen sätts av sjukfrånvarons nivå (lägre är bättre):</p>
      <ul className="space-y-10">
        {NIVAER.map((n) => (
          <li key={n.status}>
            <div className="flex items-center gap-6">
              <span
                className={`inline-block h-8 w-8 shrink-0 rounded-full ${STATUS[n.status].solid}`}
                aria-hidden="true"
              />
              <span className="font-semibold text-dark-primary">{n.namn}</span>
              <span>· {n.trosk}</span>
            </div>
            <p className="mt-2 pl-14">{n.text}</p>
          </li>
        ))}
      </ul>
    </>
  );
}
