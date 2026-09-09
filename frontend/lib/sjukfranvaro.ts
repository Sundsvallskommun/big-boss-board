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

/** Reservtabell: tillsvidareanställda per förvaltning per 2026-04-30. Summa 7 437.
 *  Nyckeln är masterdata-koden (BYGGPLAN §18), aldrig namn eller slug.
 *
 *  Används bara när importen inte har med antalet. Personalexporten levererar sedan
 *  2026-08 `SK.P.AM.001` (tillsvidareanställda) per period, och då räknas kostnaden på
 *  den siffran i stället — den följer med i tiden, till skillnad från den här tabellen.
 *  Saknas båda visas ingen kostnad, hellre det än ett tal räknat på fel underlag. */
export const ANSTALLDA: Record<string, number> = {
  "23": 2800, // Vård och omsorg
  "24": 2560, // Barn och utbildning
  "25": 42, // Miljö
  "26": 125, // Stadsbyggnad
  "27": 23, // Lantmäteri
  "28": 917, // Kommunstyrelse
  "29": 16, // Överförmyndare
  "30": 266, // Kultur och fritid
  "31": 688, // Individ och arbetsmarknad
};

export interface SjukKostnad {
  /** Antal tillsvidareanställda som beräkningen bygger på. */
  anstallda: number;
  /** Kom antalet ur importen (true) eller ur reservtabellen ovan (false)? Styr om rutan
   *  får skriva ut vilken period underlaget gäller. */
  franData: boolean;
  /** Uppskattad kostnad för de senaste tolv månaderna, kr. */
  kostnad: number;
  /** Vad samma förvaltning skulle kosta på ett år vid målnivån 6,0 %, kr. */
  vidMal: number;
  /** Skillnaden mot målnivån, kr. Positiv = merkostnad, negativ = lägre än målnivån. */
  merkostnad: number;
}

/** Räkna fram kostnaden för en förvaltning. null när underlag saknas — okänd
 *  masterdata-kod eller ingen sjukfrånvaroprocent för perioden.
 *
 *  `anstalldaFranData` är antalet ur importen (SK.P.AM.001). Finns det används det;
 *  annars faller beräkningen tillbaka på reservtabellen.
 *
 *  Sjukfrånvaroprocenten är ett rullande 12-månadersvärde, så summan är **kostnaden för de
 *  årsmodell** med ett personalantal och en schablon, inte ett bokfört utfall. */
export function sjukKostnad(
  kod: string | null | undefined,
  procent: number | null | undefined,
  anstalldaFranData?: number | null,
): SjukKostnad | null {
  if (procent == null || !Number.isFinite(procent) || procent < 0 || procent > 100) return null;
  const franData = typeof anstalldaFranData === "number" && Number.isFinite(anstalldaFranData) && anstalldaFranData > 0;
  const anstallda = franData ? anstalldaFranData! : kod ? ANSTALLDA[kod] : 0;
  if (!anstallda) return null;
  const kostnad = anstallda * procent * KR_PER_ANSTALLD_PE_AR;
  const vidMal = anstallda * SJUK_MAL * KR_PER_ANSTALLD_PE_AR;
  return { anstallda, franData, kostnad, vidMal, merkostnad: kostnad - vidMal };
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
