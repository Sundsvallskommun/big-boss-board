/** Innehåll för status-sidan (/status).
 *
 *  Syfte: en enkel, pedagogisk överblick av FRÅGOR i projektet — de som ännu
 *  väntar på svar och de som fått ett beslut. Inte produktdata, inte tekniska val.
 *  Uppdateras ENDAST manuellt på uttrycklig begäran.
 *
 *  En fråga räknas som "besvarad" så snart den har ett `svar`; annars "öppen".
 *  VIKTIGT: en fråga får flyttas till besvarad (få ett `svar`) ENDAST på uttrycklig
 *  uppgift från beställaren — så att varje beslut blir korrekt dokumenterat. Förslag,
 *  utredningar och lägesbesked som ännu inte beslutats hålls som öppna frågor; lägg då
 *  underlaget i `bakgrund` och detaljerna i `mer` (inte i `svar`).
 *  Inga personuppgifter (dataregeln gäller även här) — ange forum/roll, inte namn.
 *  Datum skrivs som ISO (YYYY-MM-DD) för korrekt sortering och <time>. */

export interface Fraga {
  /** Stabilt id för referens (visas som "#N" på kortet och i chatten).
   *  Sätts manuellt och ÅTERANVÄNDS ALDRIG — nytt kort får nästa lediga nummer
   *  (se NASTA_ID nedan), oberoende av sorteringen i arrayen. */
  id: number;
  /** Själva frågan, kort och konkret. */
  fraga: string;
  /** Bakgrund/kontext som hjälper läsaren förstå frågan. */
  bakgrund?: string;
  /** Svaret/beslutet. Finns det → frågan visas som besvarad. */
  svar?: string;
  /** Vem som svarade (forum/roll), t.ex. "Styrgrupp". */
  forum?: string;
  /** Datum för svaret (ISO). */
  datum?: string;
  /** Längre fördjupning som kan flikas ut på kortet ("Visa mer"). En post per stycke.
   *  Sammanfattningen (bakgrund/svar) visas alltid — det här är detaljerna under den. */
  mer?: string[];
}

/** Senast uppdaterad (visas i topbaren). Sätt manuellt vid ändring. Tom = visas ej. */
export const SENAST_UPPDATERAD = "2026-06-25";

/** Nästa lediga id. Höj med 1 varje gång ett kort läggs till. Återanvänd aldrig. */
export const NASTA_ID = 7;

/** Alla frågor. Öppna och besvarade visas i var sin sektion utifrån om `svar` finns. */
export const FRAGOR: Fraga[] = [
  {
    id: 1,
    fraga: "Hur många organisationsnivåer på HME ska synas i BBB?",
    bakgrund:
      "Behov har lyfts av att kunna se HME-mätningen på fler nivåer. Ska man bara se förvaltningsnivå i BBB, eller ska man kunna borra ned till djupare nivåer i organisationen?",
    svar:
      "Endast förvaltningsnivå visas i BBB. En framtida förlängning för samtliga chefer ska inkludera djupare nivåer.",
    forum: "Styrgrupp",
    datum: "2026-06-22",
  },
  {
    id: 2,
    fraga: "Hinner Kommunikativt ledarskap med i BBB efter sommaren?",
    bakgrund:
      "Osäkerhet kring när data för nyckeltalet ”Kommunikativt ledarskap” finns tillgänglig.",
    svar:
      "Data samlas in via kommande medarbetarenkät under första halvåret 2027. Nyckeltalet kan därför inte ingå i första versionen av BBB.",
    forum: "I dialog med Kommunikationsdirektör",
    datum: "2026-06-22",
  },
  {
    id: 3,
    fraga: "Hur löser vi inläsning av HME-data rent tekniskt?",
    bakgrund:
      "HME-data har vi idag i excelformat, denna skulle vi behöva kunna läsa in på lämplig plats för att senare använda för att läsa in data till nyckeltalet.",
  },
  {
    id: 4,
    fraga: "Hur hämtar vi nyckeltal för Sjukfrånvaro och Ekonomi?",
    bakgrund:
      "Vilken källa och metod ska vi använda? Alternativ: via Qlik och tillgängligt gränssnitt, eller direkt mot datalagret? Lägesbild: det finns redan en färdig export från QlikSense för dessa nyckeltal (samma som används i Stratsys) som skulle kunna återanvändas i dashboarden, med möjlighet att länka vidare till Stratsys. Frågan ska upp till styrgruppen för beslut.",
    mer: [
      "Den befintliga exporten är dock mycket detaljerad kring sjukfrånvaro. Vi behöver därför en motsvarande export som enbart ligger på förvaltningsnivå.",
      "Frågan om en ny export på förvaltningsnivå tas vidare med leverantören Mindcamp, som byggt den nuvarande exporten. Den ordinarie kontakten är borta från och med fredag, så frågan drivs vidare direkt med leverantören.",
    ],
  },
  {
    id: 5,
    fraga: "Vilken källa ska vi utgå från för HME-nyckeltalet?",
    bakgrund:
      "Vi har två källor för HME: rådata på radnivå från medarbetarenkäten, och en officiell rapport som sammanfattar HME-index per förvaltning (inklusive historik och trend). Förslag till styrgruppen: utgå från den officiella rapportens aggregerade statistik, eftersom vi inte kan återskapa de officiella värdena ur rådatan — vi saknar de underliggande vikterna och beräkningsstegen, och rapportens siffror är de som används i verksamheten.",
    mer: [
      "Båda källorna beskriver samma mätning 2025: antalet svar stämmer i praktiken överens mellan dem. Skillnaden ligger i hur HME-indexet räknas fram.",
      "När vi beräknar HME-index direkt ur rådatan avviker våra värden systematiskt från rapporten — rapporten ligger genomgående högre, särskilt för små förvaltningar (t.ex. Miljökontoret 91 mot vår beräkning 82, och Räddningstjänsten 86 mot 78). För de stora förvaltningarna stämmer värdena däremot väl överens.",
      "Vi har testat flera beräkningssätt: att poola alla individers svar, att i stället snitta chefernas och medarbetarnas medelvärden var för sig, samt att räkna på respondentnivå respektive på delindexnivå med och utan avrundning. Inget av dem återskapar rapportens siffror. Den enskilt största förbättringen kom av att vikta delgrupper lika i stället för att poola individer — vilket tyder på att den officiella metoden väger samman undergrupper snarare än enskilda svar.",
      "Slutsatsen är att det officiella indexet bygger på ett viktningsschema (vilka undergrupper som ingår och hur de vägs) som inte går att utläsa ur den platta rådatafilen. Vi kan därför inte återskapa de officiella nyckeltalen på ett tillförlitligt sätt.",
      "Rekommendation: använd den officiella rapportens aggregerade statistik som sanningskälla för HME-rubrikvärdet, historiken (2017–2025) och den verkliga trenden. De delindex (Motivation, Styrning, Ledarskap) och den chef/medarbetare-uppdelning vi tagit fram ur rådatan kan behållas som kompletterande sammanhang i dialogen, men ska då tydligt märkas som framräknade ur rådata och kan avvika något från det officiella indexet.",
    ],
  },
  {
    id: 6,
    fraga: "Hur säkerställer vi att sjukfrånvaro-nyckeltalet dokumenteras korrekt?",
    bakgrund:
      "Sjukfrånvaron som nyckeltal behöver dokumenteras tydligare. Det finns brister i dagens hantering som leder till risker (bl.a. ofullständig och fördröjd statistik). Underlaget kompletteras framåt.",
  },
];

/** En daterad statusrapport (lägesrapport om arbetet). Visas i kolumnen Statusrapporter,
 *  senaste överst. Samma disciplin som frågorna: fylls ENDAST manuellt på uttrycklig begäran,
 *  autogenereras aldrig, och innehåller inga personuppgifter (forum/roll, inte namn).
 *  Datum skrivs som ISO (YYYY-MM-DD) för korrekt sortering och <time>. */
export interface Statusrapport {
  /** Datum för rapporten (ISO). */
  datum: string;
  /** Kort rubrik för rapporten. */
  rubrik: string;
  /** Brödtext — vad som hänt/var arbetet står. */
  text: string;
  /** Valfria punkter som lyfter detaljer. */
  punkter?: string[];
}

/** Statusrapporter, senaste datum först (sorteras i vyn). */
export const STATUSRAPPORTER: Statusrapport[] = [
  {
    datum: "2026-06-25",
    rubrik: "Statusrapportering införd",
    text:
      "Den här sidan har fått en kolumn för löpande statusrapporter. Här samlas daterade " +
      "lägesrapporter om arbetet, med den senaste överst.",
  },
];
