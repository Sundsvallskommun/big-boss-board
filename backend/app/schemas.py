"""Pydantic v2-scheman för läs-API:t.

Svaren formas så att frontend kan rendera utan efterbearbetning — samma form som
prototypens AREAS-objekt (område + mätvärde + verktyg + frågor + ev. överenskommelse).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Literal
from unicodedata import normalize

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, FiniteFloat, JsonValue, model_validator

from app.models import Status, TrendDir
from app.services.ekonomi import bedom_ekonomi


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- Referensdata --------------------------------------------------------


class ToolOut(ORMModel):
    id: int
    namn: str
    ordning: int


class SupportFunctionOut(ORMModel):
    id: int
    key: str
    namn: str
    ikon: str
    tools: list[ToolOut] = []


class QuestionOut(ORMModel):
    id: int
    # Kort etikett över frågan; None för de flesta frågor.
    rubrik: str | None = None
    text: str
    # Påstående ur medarbetarenkäten som frågan bygger på (None för de flesta frågor).
    bygger_pa: str | None = None
    ordning: int


class KpiAreaOut(ORMModel):
    id: int
    key: str
    namn: str
    short: str | None
    ikon: str
    lower_better: bool
    ordning: int
    info: str | None = None
    support_function: SupportFunctionOut
    questions: list[QuestionOut] = []


# ---- Dialog (transaktionsdata) -------------------------------------------


class MeasurementOut(ORMModel):
    value_text: str
    value_num: float | None
    unit: str
    target_text: str
    target_num: float
    bar_max: float
    status: Status | None
    trend_dir: TrendDir | None = None
    trend_good: bool | None = None
    trend_text: str
    interpretation: str
    details: dict | None = None


    @model_validator(mode="after")
    def ekonomins_bedomning(self):
        # Äldre lagrade huvudfält använder ackumulerad budget. Läs alltid den aktuella
        # definitionen ur underlaget, även innan nästa import har uppdaterat huvudfälten.
        if self.details and self.details.get("typ") == "ekonomi":
            details = dict(self.details)
            netto = next((r for r in details.get("resultatrakning", [])
                          if r.get("matt_kod") == "SK.EK.RR.005"), {})
            b = bedom_ekonomi(netto.get("budget_helar"), netto.get("prognos"))
            self.value_num, self.status, self.value_text = b.diff, b.status, b.text
            self.interpretation = b.tolkning
            self.target_text, self.target_num = "Budget i balans", 0
            self.trend_dir = self.trend_good = None
            self.trend_text = ""
            details["serie"] = [
                {**p, "diff": bedom_ekonomi(p.get("budget_helar"), p.get("prognos")).diff}
                for p in details.get("serie", [])
            ]
            self.details = details
        if self.details and self.details.get("typ") == "sjukfranvaro" and self.details.get("matmetod") != "rullande12":
            self.value_num = self.status = None
            self.value_text = "Inväntar R12"
            self.trend_dir = self.trend_good = None
            self.trend_text = ""
            self.interpretation = "Importera ett aktuellt R12-uttag. Tidigare ackumulerade värden är inte jämförbara med rullande 12 månader."
        return self


class ActivityOut(ORMModel):
    id: int
    text: str
    klar: bool
    klar_notering: str | None
    skapad_at: datetime
    klar_at: datetime | None


class ActivityCreate(BaseModel):
    """Indata för att lägga till en aktivitet (endast fri text)."""

    text: str = Field(min_length=1, max_length=4000)


class ActivityKlar(BaseModel):
    """Indata för att klarrapportera en aktivitet med en kort notering."""

    notering: str = Field(default="", max_length=1000)


# ---- Inkorg: inkomna synpunkter/frågor/aktiviteter (intake) --------------


class SubmissionCreate(BaseModel):
    """Indata från det publika formuläret — endast fri text."""

    text: str = Field(min_length=1, max_length=4000)


class SubmissionOut(ORMModel):
    id: int
    text: str
    status: str
    notering: str | None
    skapad_at: datetime
    uppdaterad_at: datetime | None


class SubmissionUpdate(BaseModel):
    """Admin-triage: ändra status och/eller notering (endast angivna fält)."""

    status: str | None = None
    notering: str | None = None


# ---- Status-sidans kort (Fas B: frågor + statusrapporter i DB) -----------


class StatusFragaOut(ORMModel):
    id: int
    nummer: int
    kategori: str
    fraga: str
    bakgrund: str | None = None
    svar: str | None = None
    forum: str | None = None
    datum: str | None = None
    forslag: str | None = None
    mer: list[str] | None = None
    ordning: int
    publicerad: bool
    submission_id: int | None = None
    skapad_at: datetime
    uppdaterad_at: datetime | None = None
    publicerad_at: datetime | None = None


class StatusrapportOut(ORMModel):
    id: int
    datum: str
    rubrik: str
    text: str
    punkter: list[str] | None = None
    aterstaende: list[str] | None = None
    ordning: int
    publicerad: bool
    skapad_at: datetime
    uppdaterad_at: datetime | None = None


class StatusContentOut(BaseModel):
    """Publikt status-innehåll: publicerade frågor + statusrapporter i ett anrop."""

    fragor: list[StatusFragaOut]
    rapporter: list[StatusrapportOut]


class StatusFragaCreate(BaseModel):
    """Skapa ett frågekort (kurerat, ev. ur en inkorgs-submission)."""

    kategori: str = "fraga"  # "fraga" | "overgripande"
    fraga: str
    bakgrund: str | None = None
    svar: str | None = None
    forum: str | None = None
    datum: str | None = None
    forslag: str | None = None
    mer: list[str] | None = None
    ordning: int = 0
    publicerad: bool = True
    # Härkomst: markerar den submissionen som "publicerad" vid skapande.
    submission_id: int | None = None


class StatusFragaUpdate(BaseModel):
    """PATCH: endast angivna fält ändras. Sätt `svar` → kortet blir besvarat."""

    kategori: str | None = None
    fraga: str | None = None
    bakgrund: str | None = None
    svar: str | None = None
    forum: str | None = None
    datum: str | None = None
    forslag: str | None = None
    mer: list[str] | None = None
    ordning: int | None = None
    publicerad: bool | None = None


class StatusrapportCreate(BaseModel):
    datum: str
    rubrik: str
    text: str
    punkter: list[str] | None = None
    aterstaende: list[str] | None = None
    ordning: int = 0
    publicerad: bool = True


class StatusrapportUpdate(BaseModel):
    datum: str | None = None
    rubrik: str | None = None
    text: str | None = None
    punkter: list[str] | None = None
    aterstaende: list[str] | None = None
    ordning: int | None = None
    publicerad: bool | None = None


# ---- Dataimport ----------------------------------------------------------


def _rapportperiod(value: str) -> str:
    if date.fromisoformat(value).isoformat() != value:
        raise ValueError("Rapportperiod ska anges som YYYY-MM-DD.")
    return value


Rapportperiod = Annotated[str, AfterValidator(_rapportperiod)]
Matningsar = Annotated[str, Field(pattern=r"^[0-9]{4}$")]
Procent = Annotated[float, Field(ge=0, le=100, allow_inf_nan=False)]



class HmeRapportImport(BaseModel):
    rapport: dict[str, JsonValue]
    delindex: dict[str, JsonValue] | None = None


class HmeForvaltning(BaseModel):
    """En förvaltnings HME-serie: år -> index (null = ingen mätning det året)."""

    namn: str
    # Masterdata-kod (orgId) om filen har den — då kopplas HME robust på kod (BYGGPLAN §18).
    kod: str | None = None
    matningar: dict[Matningsar, Procent | None]
    antal_svar: int | None = Field(default=None, ge=0)
    # HME-talet byggs av tre delperspektiv (motivation, ledarskap, styrning). Var och ett
    # har en egen årsserie med samma mätår som totalen: {"motivation": {"2025": 80.0, …}}.
    # Saknas de visas bara totalen — nyckeln är valfri så äldre rapporter fungerar oförändrat.
    perspektiv: dict[str, dict[Matningsar, Procent | None]] | None = None


class HmeImport(BaseModel):
    """Normaliserad importpayload för HME (flerårig, per förvaltning)."""

    kpi: str = "hme"
    enhet: str = "index"
    kalla: str = ""
    mal: Procent = 75.0
    forvaltningar: list[HmeForvaltning]


class ImportRad(BaseModel):
    """En förvaltnings inlästa HME-data (för detaljerad importlogg)."""

    namn: str
    atgard: str  # "skapad" | "uppdaterad"
    value: str
    senaste_ar: int
    trend: str
    status: str
    antal_svar: int | None = Field(default=None, ge=0)
    ar: list[str] = []


class ImportResultat(BaseModel):
    """Sammanfattning av en import, med rad per förvaltning."""

    skapade: int
    uppdaterade: int
    hoppade_over: int = 0
    forvaltningar: list[ImportRad]


# ---- Admin (data-administration, token-skyddad) -------------------------


class AdminMeasurementIn(BaseModel):
    """Upsert-rad för ett mätvärde i en förvaltning.

    PATCH-semantik: endast angivna fält ändras på ett befintligt mätvärde. Vid
    nyskapande krävs value_text, value_num, target_text, target_num och status.
    `forvaltning` matchas mot organisationens slug eller namn.
    """

    forvaltning: str
    value_text: str | None = None
    value_num: float | None = None
    unit: str | None = None
    target_text: str | None = None
    target_num: float | None = None
    bar_max: float | None = None
    status: Status | None = None
    trend_dir: TrendDir | None = None
    trend_good: bool | None = None
    trend_text: str | None = None
    interpretation: str | None = None
    details: dict | None = None


class AdminKpiUpsert(BaseModel):
    """Body för upsert av ett nyckeltal: en rad per förvaltning."""

    rader: list[AdminMeasurementIn]


# ---- Ekonomi-import -------------------------------------------------------


class EkonomiMatt(BaseModel):
    """Ett resultaträkningsmått för en enhet (kolumnvärden i mnkr; null = saknas)."""

    namn: str
    budget_helar: FiniteFloat | None = None
    budget_ack: FiniteFloat | None = None
    utfall: FiniteFloat | None = None
    utfall_fg: FiniteFloat | None = None
    prognos: FiniteFloat | None = None
    korrigerad: bool = False
    korrigering_orsak: str | None = None


class EkonomiOmrade(BaseModel):
    """Nettokostnad nedbruten på ett verksamhetsområde (klartextnamn ofta okänt ännu)."""

    omrade_kod: str | None = None
    namn: str | None = None
    utfall: FiniteFloat | None = None
    budget_ack: FiniteFloat | None = None


class EkonomiSeriePunkt(BaseModel):
    """Nettokostnad (RR.005) en rapportperiod — en punkt i månadsserien (mnkr)."""

    period: Rapportperiod
    budget_helar: FiniteFloat | None = None
    budget_ack: FiniteFloat | None = None
    utfall: FiniteFloat | None = None
    utfall_fg: FiniteFloat | None = None
    prognos: FiniteFloat | None = None
    # Sant när punkten är manuellt korrigerad (se services/ekonomi.py).
    # Följer med ut i API:t så gränssnittet kan märka ut månaden.
    korrigerad: bool = False
    korrigering_orsak: str | None = None


class EkonomiEnhet(BaseModel):
    """En förvaltning: huvudmått (per mått_kod) + nettokostnad per område."""

    kod: str
    # Senaste underlaget för just denna enhet kan vara äldre än filsamlingens senaste period.
    period: Rapportperiod | None = None
    namn: str
    niva: str = "förvaltning"
    matt: dict[str, EkonomiMatt]
    omrade: list[EkonomiOmrade] = []
    # Månadsserie av nettokostnad över flera rapportperioder (tom = bara senaste perioden).
    serie: list[EkonomiSeriePunkt] = []


class EkonomiImport(BaseModel):
    """Normaliserad importpayload för ekonomi (per förvaltning)."""

    kpi: str = "ekonomi"
    period: Rapportperiod
    kalla: str = ""
    enheter: list[EkonomiEnhet]


class ExportFil(BaseModel):
    """Namngivet Qlik-uttag. Backend äger periodtolkning och val av dagsuttag."""

    namn: str = Field(min_length=1, max_length=255)
    text: str = Field(min_length=1, max_length=20_000_000)


class ExportFiler(BaseModel):
    filer: list[ExportFil] = Field(min_length=1, max_length=100)

    @model_validator(mode="after")
    def total_storlek(self):
        if sum(len(f.text.encode("utf-8")) for f in self.filer) > 15_000_000:
            raise ValueError("Filerna får sammanlagt vara högst 15 MB.")
        if len({normalize("NFC", f.namn) for f in self.filer}) != len(self.filer):
            raise ValueError("Varje filnamn får bara förekomma en gång i ett filpaket.")
        return self


class EkonomiCsvSerie(BaseModel):
    """Flera CSV-perioder i ett anrop → månadsserie. En rå CSV-text per rapportperiod."""

    perioder: list[str]
    kalla: str = "Ekonomisk uppföljning (Qlik-export, CSV)"


class EkonomiPost(BaseModel):
    """En rad i den råa ekonomirapporten (long-format)."""

    period: Rapportperiod | None = None
    enhet_kod: str
    enhet_namn: str
    niva: str
    matt_kod: str
    matt_namn: str
    matt_typ: str
    omrade_kod: str | None = None
    kolumn_kod: str
    kolumn_namn: str
    matvarde_mnkr: FiniteFloat | None = None


class EkonomiRapport(BaseModel):
    """Rå ekonomirapport som import-endpointen tar emot (normaliseras server-side)."""

    dataset: dict | None = None
    metadata: dict | None = None
    poster: list[EkonomiPost]


class EkonomiRad(BaseModel):
    """En enhets utfall i importsvaret."""

    namn: str
    kod: str
    value: str | None = None
    status: str | None = None
    atgard: str  # "skapad" | "uppdaterad" | "ingen_org_for_kod" | "ingen_dialog" | "ofullstandig"


class EkonomiResultat(BaseModel):
    """Sammanfattning av en ekonomi-import."""

    skapade: int
    uppdaterade: int
    hoppade_over: int
    enheter: list[EkonomiRad]


# ---- Sjukfrånvaro-import (personal-CSV) -----------------------------------


class SjukAldersgrupp(BaseModel):
    """Sjukfrånvaro (% av ordinarie arbetstid) för en åldersgrupp."""

    grupp: str
    varde: Procent | None = None


class SjukPunkt(BaseModel):
    """Rapporterade andelar per period. Omgivande import/underlag anger mätmetoden."""

    period: Rapportperiod
    total: Procent | None = None
    kvinnor: Procent | None = None
    man: Procent | None = None


class SjukEnhet(BaseModel):
    """En förvaltnings rapporterade sjukfrånvaro: senaste perioden + månadsserie."""

    kod: str
    namn: str
    period: Rapportperiod
    total: Procent | None = None
    kvinnor: Procent | None = None
    man: Procent | None = None
    langtidsandel: Procent | None = None
    # Antal tillsvidareanställda (SK.P.AM.001/K9) — underlag för kostnadsuppskattningen.
    anstallda: int | None = Field(default=None, ge=0)
    aldersgrupper: list[SjukAldersgrupp] = []
    serie: list[SjukPunkt] = []


class SjukData(BaseModel):
    """Tolkade värden, utan att tillskriva exporten en mätmetod."""

    period: Rapportperiod
    enheter: list[SjukEnhet]


class SjukImport(SjukData):
    """Normaliserad importpayload för sjukfrånvaro (per förvaltning).

    `matmetod` märker hur värdena är aggregerade. Personalexporten levererar sedan
    2026-08 **rullande 12 månader**; tidigare uttag var tertialackumulerade och har
    andra tal för samma period. Märkningen gör att en R12-import aldrig ärver punkter
    ur en serie som byggts av det gamla aggregatet.
    """

    kpi: str = "sjukfranvaro"
    kalla: str = ""
    matmetod: Literal["rullande12"]


class SjukRad(BaseModel):
    namn: str
    kod: str
    value: str | None = None
    status: str | None = None
    atgard: str


class SjukResultat(BaseModel):
    skapade: int
    uppdaterade: int
    hoppade_over: int
    enheter: list[SjukRad]
    filer_importerade: int = 0
    filer_for_kontroll: int = 0
    underlag_sparade: int = 0


class SjukUnderlagOut(BaseModel):
    id: int
    filnamn: str
    status: Literal["matmetod_okand", "ogiltigt_underlag"]
    skapad_at: datetime
    enhet: SjukEnhet | None = None


class SjukKontrollOut(BaseModel):
    underlag: list[SjukUnderlagOut] = []
    fler_finns: bool = False


class AreaStatusOut(ORMModel):
    """En manuellt satt status + kommentar för ett område i en dialog (BYGGPLAN §16).
    Append-only historik — en post per gång status sattes."""

    id: int
    # Underdimension (Verksamhet: "grunduppdrag"/"fullmaktigemal"), None för enkel status.
    dimension: str | None = None
    status: Status
    kommentar: str | None = None
    satt_at: datetime


class AreaStatusIn(BaseModel):
    """Sätt/uppdatera manuell status för ett område (per förvaltning)."""

    status: Status
    kommentar: str | None = Field(default=None, max_length=2000)
    dimension: str | None = Field(default=None, max_length=32)


class DialogueArea(BaseModel):
    """Ett område i en dialog: referensdata + mätvärde + aktiviteter.

    Allt frontend behöver för ett KPI-kort och dialogpanelen, i ett objekt.
    """

    area: KpiAreaOut
    # None för nyckeltal utan mätdata (följs upp via dialogfrågor, BYGGPLAN §17).
    measurement: MeasurementOut | None = None
    # Historik av manuellt satta statusar (BYGGPLAN §16), nyast först. Tom = ej satt.
    status_historik: list[AreaStatusOut] = []
    activities: list[ActivityOut] = []
    sjuk_kontroll: SjukKontrollOut | None = None


class PersonOut(ORMModel):
    id: int
    namn: str
    roll: str
    initialer: str


class OrganisationOut(ORMModel):
    id: int
    namn: str
    slug: str
    # Masterdata-koden är den kanoniska nyckeln (BYGGPLAN §18) — frontend kopplar
    # referensdata (t.ex. antal anställda) på den, aldrig på namn eller slug.
    kod: str | None = None
    # Förvaltning eller en av koncernens övriga verksamheter. Startsidan grupperar på detta.
    ar_forvaltning: bool = True


class DialogueDetail(BaseModel):
    """Full dialog — det enda anrop frontend behöver för dashboarden."""

    id: int
    period: str
    status: str
    skapad_at: datetime
    organisation: OrganisationOut
    ansvarig_chef: PersonOut
    areas: list[DialogueArea]


class DialogueSummary(BaseModel):
    """Listrad: org, chef, period, status."""

    id: int
    period: str
    status: str
    organisation: OrganisationOut
    ansvarig_chef: PersonOut
