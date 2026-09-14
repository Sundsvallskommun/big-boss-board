"""Uttrycklig engångsinitiering av en tom appdatabas.

Vanlig backend-start kör endast Alembic och servern. Detta kommando skapar
referensdata och dialoger i en transaktion, utan mätvärden eller filimport.
Finns någon appdata lämnas hela databasen orörd, även vid manuell återkörning.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Literal, NotRequired, TypedDict

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import Base, SessionLocal
from app.models import (
    Dialogue,
    KpiArea,
    Organisation,
    Person,
    Question,
    StatusFraga,
    Statusrapport,
    SupportFunction,
    Tool,
)
from app.services.hme_import import slugify


class QuestionTemplate(TypedDict):
    text: str
    rubrik: NotRequired[str]
    bygger_pa: NotRequired[str]


class KpiTemplate(TypedDict):
    key: str
    namn: str
    short: str | None
    ikon: str
    lower_better: bool
    support: str
    questions: list[str | tuple[str, str] | QuestionTemplate]
    info: NotRequired[str]


class StatusQuestionTemplate(TypedDict):
    nummer: int
    kategori: str
    fraga: str
    bakgrund: NotRequired[str]
    svar: NotRequired[str]
    forum: NotRequired[str]
    datum: NotRequired[str]
    forslag: NotRequired[str]
    mer: NotRequired[list[str]]


class StatusReportTemplate(TypedDict):
    datum: str
    rubrik: str
    text: str
    punkter: NotRequired[list[str]]


class SeedOrganisation(BaseModel):
    org_id: int = Field(alias="orgId", gt=0)
    namn: str = Field(min_length=1)
    forvaltning: bool = True
    dialogbaserad: list[Literal["ekonomi", "hme", "sjukfranvaro"]] = Field(default_factory=list)


class OrganisationMaster(BaseModel):
    organisationer: list[SeedOrganisation] = Field(min_length=1)


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
KPI_AREAS: list[KpiTemplate] = [
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
            "Sjukfrånvaron visas som rullande 12 månader: varje månadsstängning "
            "sammanfattar de tolv månader som slutar där. Det jämnar ut kortsiktiga "
            "variationer, men förändringar kan synas med eftersläpning.\n\n"
            "Statistiken påverkas av när frånvaron registreras och attesteras. Den "
            "senaste perioden kan därför vara ofullständig och ändras i senare uttag."
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
        # Frågorna kommer i par: en kort rubrik som säger vad frågan handlar om, och
        # frågan under. Numreringen sätts av gränssnittet, inte av texten.
        "questions": [
            {
                "rubrik": "Uppdraget",
                "text": (
                    "Hur bedömer du att verksamheten klarar sitt uppdrag just nu, och vad "
                    "grundar du den bedömningen på?"
                ),
            },
            {
                "rubrik": "Risker och avvikelser",
                "text": (
                    "Vilka problem, risker eller avvikelser behöver vi känna till? Hur "
                    "planerar du att hantera dessa?"
                ),
            },
            {
                "rubrik": "Utveckling och förflyttning",
                "text": (
                    "Vad behöver verksamheten förändra eller utveckla för att bättre klara "
                    "sitt uppdrag? Vad är viktigast för dig att åstadkomma den närmaste tiden?"
                ),
            },
            {
                "rubrik": "Omvärld och framtida förutsättningar",
                "text": (
                    "Vilka förändringar i omvärlden eller verksamhetens förutsättningar "
                    "behöver ni förhålla er till framåt?"
                ),
            },
            {
                "rubrik": "Koncernperspektiv",
                "text": (
                    "Finns det något i din verksamhet som kräver ett kommunövergripande "
                    "agerande eller påverkar andra verksamheter?"
                ),
            },
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
    {
        # Nyckeltal utan mätdata (BYGGPLAN §17) — följs upp genom dialog, inte siffror.
        # Frågeställningarna är preliminära och tas fram tillsammans med Kommunikationsdirektör.
        "key": "kommunikativt", "namn": "Kommunikativt ledarskap", "short": None, "ikon": "megaphone",
        "lower_better": False, "support": "Kommunikation",
        # Dialogfrågorna är omskrivna till chefens perspektiv; påståendet som varje fråga
        # härleds ur kommer från medarbetarenkäten och visas som ursprung i kortet.
        "questions": [
            ("Hur arbetar du för att skapa tydlighet kring mål, prioriteringar och "
             "förväntningar i din verksamhet?",
             "Min chef förklarar mål och förväntningar på ett tydligt sätt."),
            ("Hur arbetar du med återkoppling för att stärka prestation och lärande?",
             "Min chef ger medarbetare konstruktiv kritik på deras arbete."),
            ("Hur säkerställer du att du fångar upp medarbetarnas perspektiv och visar att "
             "du lyssnar på dem?",
             "Min chef är lyhörd och lyssnar på medarbetarna."),
            ("Hur involverar du medarbetarna i frågor där deras delaktighet kan bidra till "
             "bättre beslut och ökat engagemang?",
             "Min chef involverar medarbetarna i viktiga frågor som rör min organisation."),
        ],
    },
]

# Frågeställningar för de nyckeltal en verksamhet följer upp via dialog (`dialogbaserad` i
# organisationsmastern).
#
# De allmänna frågorna är skrivna mot grafen bredvid — "Vad förklarar nuläget mot budget och
# prognos?" förutsätter att en prognos syns på kortet. Här finns ingen graf, så frågan måste i
# stället be chefen beskriva hur det ser ut och går för den egna verksamheten. Frågorna ersätter
# nyckeltalets allmänna frågor för just dessa verksamheter; förvaltningarnas kort är orörda.
#
# Bara de tre datanyckeltalen behöver egna frågor. Verksamhet, Digital transformation och
# Kommunikativt ledarskap saknar mätdata för alla och är redan formulerade för ett samtal.
DIALOGBASERADE_QUESTIONS: dict[str, list[str]] = {
    "ekonomi": [
        "Hur ser er ekonomiska prognos ut för året?",
        "Var ligger den största avvikelsen mot budget — och vad beror den på?",
        "Vilka åtgärder är beslutade — och när får de effekt?",
    ],
    "hme": [
        "Hur skulle du beskriva medarbetarengagemanget hos er just nu?",
        "Vad gör ni för att stärka motivation, ledarskap och styrning?",
        "Vilka signaler fångar ni upp mellan mätningarna?",
    ],
    "sjukfranvaro": [
        "Hur ser sjukfrånvaron ut hos er — och åt vilket håll rör den sig?",
        "Är det korttids- eller långtidsfrånvaro som dominerar?",
        "Vilka rehab- och förebyggande insatser pågår?",
    ],
}

# Startinnehåll skapas endast vid uttrycklig initiering av en helt tom appdatabas.
STATUS_FRAGOR_SEED: list[StatusQuestionTemplate] = [
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

STATUSRAPPORTER_SEED: list[StatusReportTemplate] = [
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

# Befintliga slugar bevaras för samma organisationskoder även i en ny installation.
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
ORG_MASTER_PATH = Path(__file__).resolve().parent / "seed_data" / "organisationer.json"


def _question_fields(value: str | tuple[str, str] | QuestionTemplate) -> QuestionTemplate:
    if isinstance(value, str):
        return {"text": value}
    if isinstance(value, tuple):
        return {"text": value[0], "bygger_pa": value[1]}
    return value


async def _create_reference_data(session: AsyncSession) -> dict[str, KpiArea]:
    support_by_key: dict[str, SupportFunction] = {}
    for key, namn, ikon, tools in SUPPORT_FUNCTIONS:
        support = SupportFunction(key=key, namn=namn, ikon=ikon)
        session.add(support)
        await session.flush()
        support_by_key[key] = support
        session.add_all(
            Tool(support_function_id=support.id, namn=tool, ordning=index)
            for index, tool in enumerate(tools)
        )

    area_by_key: dict[str, KpiArea] = {}
    for index, template in enumerate(KPI_AREAS):
        area = KpiArea(
            key=template["key"], namn=template["namn"], short=template["short"],
            ikon=template["ikon"], lower_better=template["lower_better"], ordning=index,
            support_function_id=support_by_key[template["support"]].id,
            info=template.get("info"),
        )
        session.add(area)
        await session.flush()
        area_by_key[area.key] = area
        session.add_all(
            Question(kpi_area_id=area.id, ordning=order, **_question_fields(question))
            for order, question in enumerate(template["questions"])
        )
    session.add_all(StatusFraga(publicerad=True, **item) for item in STATUS_FRAGOR_SEED)
    session.add_all(Statusrapport(publicerad=True, **item) for item in STATUSRAPPORTER_SEED)
    return area_by_key


async def _create_organisations(
    session: AsyncSession, master: OrganisationMaster, areas: dict[str, KpiArea]
) -> None:
    person = Person(namn="Ansvarig chef", roll="Ansvarig chef", initialer="AC")
    session.add(person)
    await session.flush()
    for item in master.organisationer:
        kod = str(item.org_id)
        org = Organisation(
            kod=kod, namn=item.namn, slug=KOD_TILL_SLUG.get(kod) or slugify(item.namn),
            ar_forvaltning=item.forvaltning,
        )
        session.add(org)
        await session.flush()
        session.add(Dialogue(
            organisation_id=org.id, ansvarig_chef_id=person.id,
            period="Senaste period", status="pagaende",
        ))
        for key in item.dialogbaserad:
            session.add_all(
                Question(
                    organisation_id=org.id, kpi_area_id=areas[key].id, text=text, ordning=index
                )
                for index, text in enumerate(DIALOGBASERADE_QUESTIONS[key])
            )


async def seed(session: AsyncSession) -> bool:
    """Initiera bara en helt tom appdatabas; True om data skapades.

    Kontrollera alla modeller, även inkorg/status, så att en delvis fylld databas
    aldrig tolkas som ny. Alembics revisionstabell ingår inte i appens metadata.
    En enda transaktion omfattar kontrollen och alla inserts. Fel rullar tillbaka
    hela initieringen; ingen delmängd av referensdata blir kvar.
    """
    async with session.begin():
        for table in Base.metadata.sorted_tables:
            if await session.scalar(select(1).select_from(table).limit(1)) is not None:
                return False
        master = OrganisationMaster.model_validate_json(ORG_MASTER_PATH.read_text(encoding="utf-8"))
        areas = await _create_reference_data(session)
        await _create_organisations(session, master, areas)
    return True


async def main() -> None:
    async with SessionLocal() as session:
        created = await seed(session)
    if created:
        print("[seed] tom databas initierad med referensdata och dialoger. Importera mätdata separat.")
    else:
        print("[seed] databasen innehåller redan appdata — inga ändringar gjorda.")


if __name__ == "__main__":
    asyncio.run(main())
