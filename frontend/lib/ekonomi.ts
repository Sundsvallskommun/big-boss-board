/** Visningsformat för ekonomins API-beräknade budget–prognos. */

/** "+20,4 mnkr" · "−23,9 mnkr" · "±0 mnkr" — svensk decimalkomma och minustecken. */
export function diffText(diff: number | null): string {
  if (diff == null) return "–";
  if (diff === 0) return "±0 mnkr";
  const tal = Math.abs(diff)
    .toFixed(1)
    .replace(".", ",")
    .replace(/,0$/, "");
  return `${diff > 0 ? "+" : "−"}${tal} mnkr`;
}

/** Kort statusetikett bredvid färgpricken — färgen får aldrig bära beskedet ensam.
 *  STATUS.legend ("Över mål" m.fl.) hör till en målskala ekonomikortet inte längre har. */
export function diffLegend(diff: number | null): string {
  if (diff == null) return "Ingen prognos";
  return diff < 0 ? "Mot underskott" : "Klarar budget";
}
