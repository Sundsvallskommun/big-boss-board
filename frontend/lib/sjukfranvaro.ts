import type { SjukfranvaroDetails } from "./api";

/** Estimerad kostnad för sjukfrånvaro per förvaltning.
 *
 *  Nyckeltalet är definierat för kommunen som helhet: vid målnivå (6,0 %) kostar
 *  sjukfrånvaron cirka 12 mnkr/månad för ~8 000 anställda. Gul nivå lägger på ungefär
 *  2 mnkr och röd nivå ungefär 5 mnkr under en enskild månad.
 *
 *  Skrivet som en styckkostnad blir modellen linjär och går jämnt ut:
 *
 *      12 000 000 kr ÷ 8 000 anställda ÷ 6,0 procentenheter = 250 kr
 *
 *  alltså **250 kr per anställd och procentenhet och månad**. Den återger modellens
 *  egna hållpunkter: 7,0 % ger 14 mnkr (+2) och 8,5 % ger 17 mnkr (+5).
 *
 *  Kortet visar en uppskattad årskostnad, inte ett uppmätt historiskt utfall.
 *  Personalantalet är en ögonblicksbild; personalstyrkan kan ha varierat under året.
 *
 *  Per förvaltning multipliceras styckkostnaden med förvaltningens faktiska antal
 *  anställda och dess faktiska sjukfrånvaroprocent. Styckkostnaden behålls som
 *  modellen definierar den (basen 8 000) i stället för att kalibreras mot den
 *  verkliga summan 7 437 — summan för alla förvaltningar landar därför på ca 11,2
 *  mnkr vid målnivå, inte exakt 12.
 *
 *  Siffran är en **uppskattning för dialogen**, inte en bokförd kostnad.
 */

/** Kr per anställd och procentenhet sjukfrånvaro, per månad. Modellens hållpunkt —
 *  behålls som egen konstant eftersom härledningen ur 12 mnkr/månad visas i kortet. */
export const KR_PER_ANSTALLD_PE_MANAD = 250;

/** Detsamma per år. Det är den här beräkningen kortet använder. */
export const KR_PER_ANSTALLD_PE_AR = KR_PER_ANSTALLD_PE_MANAD * 12;

/** Målnivån för sjukfrånvaro i procent — samma tröskel som statusfärgen använder. */
export const SJUK_MAL = 6.0;

export interface SjukKostnad {
  /** Antal tillsvidareanställda som beräkningen bygger på. */
  anstallda: number;
  /** Uppskattad årskostnad vid aktuell R12-nivå, kr. */
  kostnad: number;
  /** Vad samma förvaltning skulle kosta på ett år vid målnivån 6,0 %, kr. */
  vidMal: number;
  /** Skillnaden mot målnivån, kr. Positiv = merkostnad, negativ = lägre än målnivån. */
  merkostnad: number;
}

/** Räkna fram kostnaden för en förvaltning. null när personalantal eller
 *  sjukfrånvaroprocent saknas för perioden.
 *
 *  `anstalldaFranData` är antalet ur importen (SK.P.AM.001). Finns det används det;
 *  annars kan kostnaden inte beräknas.
 *
 *  Årsmodellen använder R12-nivån och ett personalantal, inte bokförda kostnader. */
export function sjukKostnad(
  procent: number | null | undefined,
  anstalldaFranData?: number | null,
): SjukKostnad | null {
  if (procent == null || !Number.isFinite(procent) || procent < 0 || procent > 100) return null;
  if (anstalldaFranData == null || !Number.isInteger(anstalldaFranData) || anstalldaFranData < 0) return null;
  const anstallda = anstalldaFranData;
  const kostnad = anstallda * procent * KR_PER_ANSTALLD_PE_AR;
  const vidMal = anstallda * SJUK_MAL * KR_PER_ANSTALLD_PE_AR;
  return { anstallda, kostnad, vidMal, merkostnad: kostnad - vidMal };
}

/** Kronor → "5,4 mnkr" · "963 tkr" · "400 kr" — dialogen ska kunna läsas högt.
 *
 *  Enheten byts vid hela miljoner respektive tiotusen kronor. Annars hamnar 963 200 kr
 *  på "1 mnkr" (avrundat uppåt från 0,96) och 400 kr på "0 tkr", vilket båda läser fel:
 *  det första låter exakt fast det inte är det, det andra ser ut som ingenting. */
export function krText(kr: number): string {
  const abs = Math.abs(kr);
  if (abs >= 1_000_000) {
    const mnkr = kr / 1_000_000;
    return `${mnkr.toFixed(abs >= 10_000_000 ? 0 : 1).replace(".", ",")} mnkr`;
  }
  if (abs >= 10_000) return `${Math.round(kr / 1000)} tkr`;
  return `${Math.round(kr).toLocaleString("sv-SE")} kr`;
}

/** Signerad variant för merkostnaden mot målnivån. */
export function krDiffText(kr: number): string {
  if (Math.round(kr / 1000) === 0) return "±0";
  return (kr > 0 ? "+" : "−") + krText(Math.abs(kr));
}

/** Saknade aktuella deluppgifter; noll är ett värde, aldrig en lucka. */
export function sjukSaknadeUppgifter(details: SjukfranvaroDetails, total: number | null | undefined): string[] {
  const saknas: string[] = [];
  if (total == null) saknas.push("total sjukfrånvaro");
  if (details.kvinnor == null) saknas.push("sjukfrånvaro för kvinnor");
  if (details.man == null) saknas.push("sjukfrånvaro för män");
  if (details.langtidsandel == null) saknas.push("långtidsandel");
  if (details.anstallda == null) saknas.push("antal anställda");
  for (const grupp of ["29 år eller yngre", "30–49 år", "50 år eller äldre"]) {
    if (details.aldersgrupper?.find((a) => a.grupp === grupp)?.varde == null) {
      saknas.push(`åldersgrupp ${grupp}`);
    }
  }
  return saknas;
}
