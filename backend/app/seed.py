"""Idempotent seed med fiktiv dummydata (motsvarar prototypen).

Körs i entrypoint efter migrationer. Säker att köra om och om — kontrollerar
existens på naturliga nycklar innan rader skapas. ENDAST fiktiv, öppen information.
"""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.models import (
    KpiArea,
    Organisation,
    Question,
    Statusrapport,
    StatusFraga,
    SupportFunction,
    Tool,
)
from app.schemas import EkonomiImport, HmeImport, SjukImport
from app.services.ekonomi_import import csv_to_payload as ekonomi_csv_to_payload
from app.services.ekonomi_import import import_ekonomi
from app.services.ekonomi_import import report_to_payload as ekonomi_report_to_payload
from app.services.hme_import import import_hme, report_to_payload
from app.services.sjukfranvaro_import import csv_to_payload as sjuk_csv_to_payload
from app.services.sjukfranvaro_import import import_sjukfranvaro

# Stödfunktioner + verktygslåda (key, namn, ikon, [verktyg]).
SUPPORT_FUNCTIONS: list[tuple[str, str, str, list[str]]] = [
    ("Ekonomi", "Ekonomi", "landmark", [
        "Budgetprocess", "Styrmodell", "Redovisning", "Fakturahantering",
        "Delrapport & uppföljning", "Planeringsförutsättningar", "Controller",
    ]),
    ("HR", "HR", "users", [
        "HR-partner", "Företagshälsovård", "AG-riktlinjer", "Ledarutbildning",
        "Riktlinjer & stödmaterial", "Lön/Pension", "Rekrytering/Bemanning",
    ]),
    ("Kommunikation", "Kommunikation", "megaphone", [
        "Stöd i mediakontakter", "Sociala medier", "Kommunikationsstöd",
        "Tillgänglighetsanpassning", "Varumärke", "Kommunikationsplan", "Kampanjer",
    ]),
    ("Verksamhet", "Verksamhet", "target", [
        "Resultat", "Kundnöjdhet", "Roll", "Verksamhetsutveckling",
        "Måluppfyllelse", "Public 360", "MRP",
    ]),
    ("Digitalisering", "Digitalisering", "cpu", [
        "Digital strategi", "E-tjänster", "Systemförvaltning", "Informationssäkerhet",
        "Dataskydd (GDPR)", "Automatisering", "IT-stöd",
    ]),
]

# KPI-områden (key, namn, short, ikon, lower_better, support-key, frågor).
KPI_AREAS: list[dict] = [
    {
        "key": "ekonomi", "namn": "Ekonomi", "short": None, "ikon": "landmark",
        "lower_better": False, "support": "Ekonomi",
        "info": (
            "Ekonominyckeltalen uppdateras den 7:e varje månad (i januari dröjer det längre, "
            "normalt till den 15:e eller senare). Vid uppdateringen läses all ekonomidata in "
            "med brytdatum föregående månad, och data fylls på löpande under månaden. Helheten "
            "för en månad syns därför först en bit in i nästa — hela maj går till exempel att se "
            "först runt den 8–10 juni, och dessförinnan är bilden ofullständig."
        ),
        "questions": [
            "Vad förklarar nuläget mot budget och prognos?",
            "Vilka åtgärder är beslutade — och när får de effekt?",
            "Var finns den största osäkerheten framåt?",
        ],
    },
    {
        "key": "hme", "namn": "Hållbart medarbetarengagemang", "short": "HME", "ikon": "users",
        "lower_better": False, "support": "HR",
        "questions": [
            "Vad driver engagemanget på enheten just nu?",
            "Hur följs medarbetarsamtalen upp i praktiken?",
            "Finns tidiga signaler att bevaka inför nästa mätning?",
        ],
    },
    {
        "key": "sjukfranvaro", "namn": "Sjukfrånvaro", "short": None, "ikon": "heart-pulse",
        "lower_better": True, "support": "HR",
        "info": (
            "Lönekörning sker en gång per månad, runt den 20:e, och då genereras "
            "sjukfrånvarostatistiken för den senaste perioden. Sjukfrånvaro som medarbetare "
            "ännu inte registrerat, eller som chef inte hunnit godkänna/attestera före "
            "lönekörningen, kommer inte med. Eftersom lönekörningen sker den 20:e missas "
            "omkring 10 av månadens cirka 30 dagar — den senaste månaden visar därför "
            "erfarenhetsmässigt bara runt 70–80 % av den slutliga bilden och ser nästan "
            "alltid bättre ut än verkligheten. Tillförlitlig statistik finns först när ett "
            "par månader gått och all registrering kommit med."
        ),
        "questions": [
            "Är det kort- eller långtidsfrånvaro som ökar?",
            "Vilka rehab- och förebyggande insatser pågår?",
            "Behövs stöd från HR-partner eller företagshälsovård?",
        ],
    },
    {
        "key": "verksamhet", "namn": "Verksamhet", "short": None, "ikon": "target",
        "lower_better": False, "support": "Verksamhet",
        "questions": [
            "Hur ligger ni mot uppsatta verksamhetsmål?",
            "Vad säger kundnöjdheten just nu?",
            "Vilken utveckling prioriterar du framåt?",
        ],
    },
    {
        "key": "digital", "namn": "Digital transformation", "short": None, "ikon": "cpu",
        "lower_better": False, "support": "Digitalisering",
        "questions": [
            "Vilka digitala initiativ pågår – och vilken nytta ger de?",
            "Hur tas medarbetarna med i förändringen?",
            "Var finns hindren: kompetens, system eller resurser?",
        ],
    },
]

# Status-sidans kort (Fas B). Bootstrap-innehåll transkriberat från den tidigare
# hårdkodade frontend-filen (data.ts). Seedas EN gång (bara om tabellen är tom) så att
# arbetsgruppens senare API-redigeringar/raderingar inte återuppstår vid omstart.
# `nummer` = det publika "#N"; övergripande frågor har kategori "overgripande".
STATUS_FRAGOR_SEED: list[dict] = [
    {
        "nummer": 1, "kategori": "fraga",
        "fraga": "Hur många organisationsnivåer på HME ska synas i BBB?",
        "bakgrund": (
            "Behov har lyfts av att kunna se HME-mätningen på fler nivåer. Ska man bara se "
            "förvaltningsnivå i BBB, eller ska man kunna borra ned till djupare nivåer i organisationen?"
        ),
        "svar": (
            "Endast förvaltningsnivå visas i BBB. En framtida förlängning för samtliga chefer "
            "ska inkludera djupare nivåer."
        ),
        "forum": "Styrgrupp", "datum": "2026-06-22",
    },
    {
        "nummer": 2, "kategori": "fraga",
        "fraga": "Hinner Kommunikativt ledarskap med i BBB efter sommaren?",
        "bakgrund": "Osäkerhet kring när data för nyckeltalet ”Kommunikativt ledarskap” finns tillgänglig.",
        "svar": (
            "Data samlas in via kommande medarbetarenkät under första halvåret 2027. Nyckeltalet "
            "kan därför inte ingå i första versionen av BBB."
        ),
        "forum": "I dialog med Kommunikationsdirektör", "datum": "2026-06-22",
    },
    {
        "nummer": 3, "kategori": "fraga",
        "fraga": "Hur löser vi inläsning av HME-data rent tekniskt?",
        "bakgrund": (
            "HME-data har vi idag i excelformat, denna skulle vi behöva kunna läsa in på lämplig "
            "plats för att senare använda för att läsa in data till nyckeltalet."
        ),
        "forslag": (
            "Att använda oss av data från officiell rapport för HME från 2025. Att vi inte använder "
            "rådata för att räkna ut nyckeltal. Detta förslag bygger på att vi idag inte lyckats få fram "
            "en beskrivning av hur HME-värdena räknas ut på förvaltningsnivå, t.ex. hur värden viktas för "
            "att få ett slutresultat. En annan fördel med att använda rapportens aggregerade och "
            "sammanställda data är att vi då får med historik direkt till 2017."
        ),
    },
    {
        "nummer": 4, "kategori": "fraga",
        "fraga": "Hur hämtar vi nyckeltal för Sjukfrånvaro och Ekonomi?",
        "bakgrund": (
            "Vilken källa och metod ska vi använda? Alternativ: via Qlik och tillgängligt gränssnitt, "
            "eller direkt mot datalagret? Lägesbild: det finns redan en färdig export från QlikSense för "
            "dessa nyckeltal (samma som används i Stratsys) som skulle kunna återanvändas i dashboarden, "
            "med möjlighet att länka vidare till Stratsys. Frågan ska upp till styrgruppen för beslut."
        ),
        "mer": [
            "Den befintliga exporten är dock mycket detaljerad kring sjukfrånvaro. Vi behöver därför en "
            "motsvarande export som enbart ligger på förvaltningsnivå.",
            "Frågan om en ny export på förvaltningsnivå tas vidare med leverantören Mindcamp, som byggt "
            "den nuvarande exporten. Den ordinarie kontakten är borta från och med fredag, så frågan "
            "drivs vidare direkt med leverantören.",
        ],
    },
    {
        "nummer": 5, "kategori": "fraga",
        "fraga": "Vilken källa ska vi utgå från för HME-nyckeltalet?",
        "bakgrund": (
            "Vi har två källor för HME: rådata på radnivå från medarbetarenkäten, och en officiell "
            "rapport som sammanfattar HME-index per förvaltning (inklusive historik och trend). Förslag "
            "till styrgruppen: utgå från den officiella rapportens aggregerade statistik, eftersom vi inte "
            "kan återskapa de officiella värdena ur rådatan — vi saknar de underliggande vikterna och "
            "beräkningsstegen, och rapportens siffror är de som används i verksamheten."
        ),
        "mer": [
            "Båda källorna beskriver samma mätning 2025: antalet svar stämmer i praktiken överens mellan "
            "dem. Skillnaden ligger i hur HME-indexet räknas fram.",
            "När vi beräknar HME-index direkt ur rådatan avviker våra värden systematiskt från rapporten "
            "— rapporten ligger genomgående högre, särskilt för små förvaltningar (t.ex. Miljökontoret 91 "
            "mot vår beräkning 82, och Räddningstjänsten 86 mot 78). För de stora förvaltningarna stämmer "
            "värdena däremot väl överens.",
            "Vi har testat flera beräkningssätt: att poola alla individers svar, att i stället snitta "
            "chefernas och medarbetarnas medelvärden var för sig, samt att räkna på respondentnivå "
            "respektive på delindexnivå med och utan avrundning. Inget av dem återskapar rapportens siffror. "
            "Den enskilt största förbättringen kom av att vikta delgrupper lika i stället för att poola "
            "individer — vilket tyder på att den officiella metoden väger samman undergrupper snarare än "
            "enskilda svar.",
            "Slutsatsen är att det officiella indexet bygger på ett viktningsschema (vilka undergrupper som "
            "ingår och hur de vägs) som inte går att utläsa ur den platta rådatafilen. Vi kan därför inte "
            "återskapa de officiella nyckeltalen på ett tillförlitligt sätt.",
            "Rekommendation: använd den officiella rapportens aggregerade statistik som sanningskälla för "
            "HME-rubrikvärdet, historiken (2017–2025) och den verkliga trenden. De delindex (Motivation, "
            "Styrning, Ledarskap) och den chef/medarbetare-uppdelning vi tagit fram ur rådatan kan behållas "
            "som kompletterande sammanhang i dialogen, men ska då tydligt märkas som framräknade ur rådata "
            "och kan avvika något från det officiella indexet.",
        ],
    },
    {
        "nummer": 6, "kategori": "fraga",
        "fraga": "Hur säkerställer vi att sjukfrånvaro-nyckeltalet dokumenteras korrekt?",
        "bakgrund": (
            "Sjukfrånvaron som nyckeltal behöver dokumenteras tydligare. Det finns brister i dagens "
            "hantering som leder till risker (bl.a. ofullständig och fördröjd statistik). Underlaget "
            "kompletteras framåt."
        ),
        "forslag": (
            "Kommunkoncernen föreslås upprätta ett koncerngemensamt nyckeltalsbibliotek med alla "
            "algoritmer/beräkningar dokumenterade, så att man kan reproducera nyckeltal utifrån rådata "
            "fritt och inte kräva ett visst system."
        ),
    },
    {
        "nummer": 7, "kategori": "fraga",
        "fraga": "Hur hanteras månadsdata i Qlik-export?",
        "bakgrund": (
            "Hur hanteras månadsdata i den exportfil kring ekonomi som finns nu? Det verkar som att "
            "exportfilen som vi nu fått enbart är för maj, skapas det en ny fil per månad för ekonomidata "
            "och ser det likadant ut då för sjukfrånvaro?"
        ),
    },
    {
        "nummer": 9, "kategori": "fraga",
        "fraga": "Mäts sjukfrånvaro i tertial?",
    },
    {
        "nummer": 8, "kategori": "overgripande",
        "fraga": "Upprättande av ett nyckeltalsbibliotek",
        "bakgrund": (
            "Under arbetet har det blivit mycket tydligt att många av de nyckeltal som används i "
            "uppföljning idag saknar dokumentation. Det gör det mycket svårt att förstå hur ett "
            "nyckeltal räknas ut."
        ),
        "forslag": (
            "Koncernen behöver upprätta en form av nyckeltalsbibliotek där samtliga nyckeltal som "
            "används finns beskrivna i detalj rörande hur de räknas ut. Syftet är transparens och "
            "öppenhet, att nyckeltalen går att reproducera i framtiden, och att vi inte skapar ett "
            "enormt beroende till nuvarande tekniska lösningar."
        ),
    },
]

STATUSRAPPORTER_SEED: list[dict] = [
    {
        "datum": "2026-06-26",
        "rubrik": "Lägesrapport vecka 26 — prototypen redo för test",
        "text": (
            "En intensiv vecka där de stora tekniska delarna kommit på plats. Prototypen är nu så "
            "färdig den kan bli inför användartester och kvalitetskontroll av data — tekniken är i "
            "stort sett klar inför första styrgruppsmötet. Nästa steg är att låta ansvarig chef och "
            "styrgruppen testa och ge feedback, varpå vi gör en ändringsloop utifrån det. Nästa vecka "
            "planerar vi arbetet med att produktionssätta lösningen parallellt med sluttester och "
            "verifiering av data."
        ),
        "punkter": [
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
        "datum": "2026-06-25",
        "rubrik": "Statusrapportering införd",
        "text": (
            "Den här sidan har fått en kolumn för löpande statusrapporter. Här samlas daterade "
            "lägesrapporter om arbetet, med den senaste överst."
        ),
    },
]

# Officiella HME-totalindexrapporten (flerårig, per enhet/förvaltning). Levereras utanför
# git och monteras lokalt/vid deploy; i drift uppdateras HME istället via /api/import/hme.
HME_REPORT_PATH = Path(__file__).resolve().parent / "data" / "hme_totalindex.json"

# Ekonomirapporten (resultaträkning per förvaltning) levereras utanför git, samma väg som HME.
# Qlik-exporten är CSV framåt; JSON stöds som tidigare format. CSV prioriteras om båda finns.
EKONOMI_CSV_PATH = Path(__file__).resolve().parent / "data" / "ekonomi.csv"
EKONOMI_REPORT_PATH = Path(__file__).resolve().parent / "data" / "ekonomi.json"

# Sjukfrånvaro (personal-CSV från Qlik) — levereras utanför git, samma väg.
SJUK_CSV_PATH = Path(__file__).resolve().parent / "data" / "sjukfranvaro.csv"

# Masterdata-organisationsid → org-slug (de slugar HME redan skapat). Sätter Organisation.kod
# så att ekonomi (och framtida dataset) kan kopplas på koden. Räddningstjänsten/Stadsbacken
# saknas i masterdatan här och får därför ingen kod ännu.
KOD_TILL_SLUG: dict[str, str] = {
    "24": "barn-och-utbildningsforvaltning",
    "23": "vard-och-omsorgsforvaltningen",
    "31": "individ-och-arbetsmarknadsforvaltning",
    "28": "kommunstyrelsekontoret",
    "30": "kultur-och-fritid",
    "26": "stadsbyggnadskontoret",
    "25": "miljokontoret",
    "29": "overformyndarkontoret",
    "27": "lantmaterikontoret",
}


async def _get_or_create(session: AsyncSession, model, defaults: dict | None = None, **filters):
    """Hämta rad på filters eller skapa den. Returnerar (objekt, skapad?)."""
    existing = (await session.execute(select(model).filter_by(**filters))).scalar_one_or_none()
    if existing is not None:
        return existing, False
    obj = model(**{**filters, **(defaults or {})})
    session.add(obj)
    await session.flush()
    return obj, True


async def _bootstrap_status_content(session: AsyncSession) -> None:
    """Fyll status_fraga/statusrapport med startinnehållet — bara om tabellen är tom.

    Engångs-bootstrap: när arbetsgruppen börjat redigera/publicera via API rör vi
    aldrig innehållet igen (annars skulle raderade kort återuppstå vid omstart).
    """
    antal_fragor = (await session.execute(select(func.count()).select_from(StatusFraga))).scalar()
    if antal_fragor == 0:
        for f in STATUS_FRAGOR_SEED:
            session.add(StatusFraga(publicerad=True, **f))
        print(f"[seed] status-frågor bootstrappade: {len(STATUS_FRAGOR_SEED)} kort.")

    antal_rapporter = (
        await session.execute(select(func.count()).select_from(Statusrapport))
    ).scalar()
    if antal_rapporter == 0:
        for r in STATUSRAPPORTER_SEED:
            session.add(Statusrapport(publicerad=True, **r))
        print(f"[seed] statusrapporter bootstrappade: {len(STATUSRAPPORTER_SEED)} st.")

    await session.commit()


async def seed(session: AsyncSession) -> None:
    # Stödfunktioner + verktyg.
    support_by_key: dict[str, SupportFunction] = {}
    for key, namn, ikon, tools in SUPPORT_FUNCTIONS:
        sf, _ = await _get_or_create(
            session, SupportFunction, {"namn": namn, "ikon": ikon}, key=key
        )
        support_by_key[key] = sf
        for ordning, tool_namn in enumerate(tools):
            await _get_or_create(
                session, Tool, {"ordning": ordning},
                support_function_id=sf.id, namn=tool_namn,
            )

    # KPI-områden + frågor.
    area_by_key: dict[str, KpiArea] = {}
    for ordning, a in enumerate(KPI_AREAS):
        area, _ = await _get_or_create(
            session, KpiArea,
            {
                "namn": a["namn"], "short": a["short"], "ikon": a["ikon"],
                "lower_better": a["lower_better"], "ordning": ordning,
                "support_function_id": support_by_key[a["support"]].id,
                "info": a.get("info"),
            },
            key=a["key"],
        )
        area_by_key[a["key"]] = area
        for q_ordning, text in enumerate(a["questions"]):
            await _get_or_create(
                session, Question, {"ordning": q_ordning},
                kpi_area_id=area.id, text=text,
            )

    await session.commit()

    # Status-sidans kort (Fas B) — engångs-bootstrap av startinnehållet.
    await _bootstrap_status_content(session)

    # HME-rapporten levereras utanför git (monteras lokalt/vid deploy). Finns den
    # importeras förvaltningsdialogerna via samma väg som /api/import/hme. Saknas den
    # kör appen vidare med enbart referensdata (väljaren visar tomt läge) — i drift
    # fylls HME på via import-endpointen.
    if HME_REPORT_PATH.exists():
        report = json.loads(HME_REPORT_PATH.read_text(encoding="utf-8"))
        payload = HmeImport(**report_to_payload(report))
        resultat = await import_hme(session, payload)
        print(
            f"[seed] HME importerad ur {HME_REPORT_PATH.name}: "
            f"{resultat['skapade']} skapade, {resultat['uppdaterade']} uppdaterade."
        )
    else:
        print(
            f"[seed] {HME_REPORT_PATH.name} saknas — hoppar över HME-import "
            "(importera via /api/import/hme)."
        )

    # Sätt masterdata-kod på förvaltningsorganisationerna (kanonisk nyckel som dataset kopplar mot).
    # Körs alltid (även utan HME-fil) så att redan seedade orgs får sin kod och ekonomi kan kopplas.
    for kod, slug in KOD_TILL_SLUG.items():
        org = (await session.execute(select(Organisation).filter_by(slug=slug))).scalar_one_or_none()
        if org is not None and org.kod != kod:
            org.kod = kod
    await session.commit()

    # Ekonomirapporten levereras utanför git (samma som HME). Finns den importeras ekonomidata
    # per förvaltning via samma väg som /api/import/ekonomi (matchar på masterdata-koden).
    ek = kalla = None
    if EKONOMI_CSV_PATH.exists():
        text = EKONOMI_CSV_PATH.read_text(encoding="utf-8-sig")
        ek = await import_ekonomi(session, EkonomiImport(**ekonomi_csv_to_payload(text)))
        kalla = EKONOMI_CSV_PATH.name
    elif EKONOMI_REPORT_PATH.exists():
        rapport = json.loads(EKONOMI_REPORT_PATH.read_text(encoding="utf-8"))
        ek = await import_ekonomi(session, EkonomiImport(**ekonomi_report_to_payload(rapport)))
        kalla = EKONOMI_REPORT_PATH.name

    if ek is not None:
        print(
            f"[seed] Ekonomi importerad ur {kalla}: "
            f"{ek['skapade']} skapade, {ek['uppdaterade']} uppdaterade, {ek['hoppade_over']} hoppade över."
        )
    else:
        print("[seed] ingen ekonomifil (ekonomi.csv/ekonomi.json) — hoppar över ekonomidata.")

    # Sjukfrånvaro (personal-CSV). Finns den importeras den per förvaltning (matchar på kod).
    if SJUK_CSV_PATH.exists():
        sj = await import_sjukfranvaro(
            session, SjukImport(**sjuk_csv_to_payload(SJUK_CSV_PATH.read_text(encoding="utf-8-sig")))
        )
        print(
            f"[seed] Sjukfrånvaro importerad ur {SJUK_CSV_PATH.name}: "
            f"{sj['skapade']} skapade, {sj['uppdaterade']} uppdaterade, {sj['hoppade_over']} hoppade över."
        )
    else:
        print(f"[seed] {SJUK_CSV_PATH.name} saknas — hoppar över sjukfrånvarodata.")


async def main() -> None:
    async with SessionLocal() as session:
        await seed(session)
    print("[seed] klart (idempotent).")


if __name__ == "__main__":
    asyncio.run(main())
