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
  /** Förslag till beslut: en rekommendation som väntar på beslut. Frågan är fortfarande
   *  ÖPPEN (ersätter inte `svar`) men visas med en egen ruta i kortet och en indikator i
   *  översikten. Ett `svar` (beslut) sätts först på uttrycklig begäran. */
  forslag?: string;
}

/** Senast uppdaterad (visas i topbaren). Sätt manuellt vid ändring. Tom = visas ej. */
export const SENAST_UPPDATERAD = "2026-06-26";

/** Nästa lediga id — GLOBALT över alla kort (FRAGOR + OVERGRIPANDE), så att varje kort
 *  har ett unikt #N. Höj med 1 varje gång ett kort läggs till, oavsett lista. Återanvänd aldrig. */
export const NASTA_ID = 10;

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
    forslag:
      "Att använda oss av data från officiell rapport för HME från 2025. Att vi inte använder " +
      "rådata för att räkna ut nyckeltal. Detta förslag bygger på att vi idag inte lyckats få fram " +
      "en beskrivning av hur HME-värdena räknas ut på förvaltningsnivå, t.ex. hur värden viktas för " +
      "att få ett slutresultat. En annan fördel med att använda rapportens aggregerade och " +
      "sammanställda data är att vi då får med historik direkt till 2017.",
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
    forslag:
      "Kommunkoncernen föreslås upprätta ett koncerngemensamt nyckeltalsbibliotek med alla " +
      "algoritmer/beräkningar dokumenterade, så att man kan reproducera nyckeltal utifrån rådata " +
      "fritt och inte kräva ett visst system.",
  },
  {
    id: 7,
    fraga: "Hur hanteras månadsdata i Qlik-export?",
    bakgrund:
      "Hur hanteras månadsdata i den exportfil kring ekonomi som finns nu? Det verkar som att exportfilen som vi nu fått enbart är för maj, skapas det en ny fil per månad för ekonomidata och ser det likadant ut då för sjukfrånvaro?",
  },
  {
    id: 9,
    fraga: "Mäts sjukfrånvaro i tertial?",
  },
];

/** En övergripande/strategisk fråga som behöver hanteras UTANFÖR detta projekt
 *  (koncern-/förvaltningsövergripande nivå). Visas i den röda kolumnen "Övergripande frågor".
 *  Samma disciplin som frågorna: fylls manuellt, inga personuppgifter, ISO-datum.
 *  `id` delar nummerserie med FRAGOR (globalt unika kort, se NASTA_ID). */
export interface OvergripandeFraga {
  id: number;
  /** Rubrik för frågan. */
  fraga: string;
  /** Bakgrund/kontext. */
  bakgrund: string;
  /** Förslag till beslut — visas som egen ruta + indikator-pill (samma som FRAGOR). */
  forslag?: string;
  /** Valfri fördjupning som kan flikas ut ("Visa mer"). En post per stycke. */
  mer?: string[];
}

/** Övergripande/strategiska frågor (hanteras utanför projektet). Delar id-serie med FRAGOR. */
export const OVERGRIPANDE: OvergripandeFraga[] = [
  {
    id: 8,
    fraga: "Upprättande av ett nyckeltalsbibliotek",
    bakgrund:
      "Under arbetet har det blivit mycket tydligt att många av de nyckeltal som används i " +
      "uppföljning idag saknar dokumentation. Det gör det mycket svårt att förstå hur ett " +
      "nyckeltal räknas ut.",
    forslag:
      "Koncernen behöver upprätta en form av nyckeltalsbibliotek där samtliga nyckeltal som " +
      "används finns beskrivna i detalj rörande hur de räknas ut. Syftet är transparens och " +
      "öppenhet, att nyckeltalen går att reproducera i framtiden, och att vi inte skapar ett " +
      "enormt beroende till nuvarande tekniska lösningar.",
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
    datum: "2026-06-26",
    rubrik: "Lägesrapport vecka 26 — prototypen redo för test",
    text:
      "En intensiv vecka där de stora tekniska delarna kommit på plats. Prototypen är nu så " +
      "färdig den kan bli inför användartester och kvalitetskontroll av data — tekniken är i " +
      "stort sett klar inför första styrgruppsmötet. Nästa steg är att låta ansvarig chef och " +
      "styrgruppen testa och ge feedback, varpå vi gör en ändringsloop utifrån det. Nästa vecka " +
      "planerar vi arbetet med att produktionssätta lösningen parallellt med sluttester och " +
      "verifiering av data.",
    punkter: [
      "HME: riktig anonymiserad data per förvaltning ur officiella totalindex-rapporten — historik från 2017 och verklig trend, med förvaltningsväljare.",
      "Ekonomi: nettokostnad mot budget med kombinationsdiagram (budget, utfall, prognos).",
      "Sjukfrånvaro: total sjukfrånvaro med köns- och åldersfördelning samt tröskelvärden som styr färg (grön/gul/röd).",
      "Datainläsning: token-skyddade import-API:er och admin-GUI med inläsningslogg — HME (JSON) samt ekonomi och sjukfrånvaro via Qlik-CSV. Förvaltningar kopplas via masterdata-id.",
      "Dialogen: aktiviteter och åtgärder ersätter överenskommelser; omarbetad dashboard och dialogpanel.",
      "Status-sidan: frågor & beslut, förslag till beslut, övergripande koncernfrågor och en kolumn för löpande lägesrapporter.",
      "Beslut: endast förvaltningsnivå visas för HME (#1); Kommunikativt ledarskap kan inte ingå i första versionen (#2).",
      "Nya förslag till beslut: utgå från officiella HME-rapporten i stället för rådata (#3) och upprätta ett koncerngemensamt nyckeltalsbibliotek (#6/#8).",
      "Öppna punkter: källa och metod för sjukfrånvaro och ekonomi (#4), HME-källa (#5) samt hur Qlik hanterar månadsdata (#7).",
    ],
  },
  {
    datum: "2026-06-25",
    rubrik: "Statusrapportering införd",
    text:
      "Den här sidan har fått en kolumn för löpande statusrapporter. Här samlas daterade " +
      "lägesrapporter om arbetet, med den senaste överst.",
  },
];
