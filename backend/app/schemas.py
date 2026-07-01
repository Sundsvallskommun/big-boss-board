"""Pydantic v2-scheman för läs-API:t.

Svaren formas så att frontend kan rendera utan efterbearbetning — samma form som
prototypens AREAS-objekt (område + mätvärde + verktyg + frågor + ev. överenskommelse).
"""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from app.models import Status, TrendDir


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
    text: str
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
    value_num: float
    unit: str
    target_text: str
    target_num: float
    bar_max: float
    status: Status
    trend_dir: TrendDir | None = None
    trend_good: bool | None = None
    trend_text: str
    interpretation: str
    details: dict | None = None


class ActivityOut(ORMModel):
    id: int
    text: str
    klar: bool
    klar_notering: str | None
    skapad_at: datetime
    klar_at: datetime | None


class ActivityCreate(BaseModel):
    """Indata för att lägga till en aktivitet (endast fri text)."""

    text: str


class ActivityKlar(BaseModel):
    """Indata för att klarrapportera en aktivitet med en kort notering."""

    notering: str = ""


# ---- Inkorg: inkomna synpunkter/frågor/aktiviteter (intake) --------------


class SubmissionCreate(BaseModel):
    """Indata från det publika formuläret — endast fri text."""

    text: str


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


# ---- Dataimport ----------------------------------------------------------


class HmeForvaltning(BaseModel):
    """En förvaltnings HME-serie: år -> index (null = ingen mätning det året)."""

    namn: str
    matningar: dict[str, float | None]
    antal_svar: int | None = None


class HmeImport(BaseModel):
    """Normaliserad importpayload för HME (flerårig, per förvaltning)."""

    kpi: str = "hme"
    enhet: str = "index"
    kalla: str = ""
    mal: float = 75.0
    forvaltningar: list[HmeForvaltning]


class ImportRad(BaseModel):
    """En förvaltnings inlästa HME-data (för detaljerad importlogg)."""

    namn: str
    atgard: str  # "skapad" | "uppdaterad"
    value: str
    senaste_ar: int
    trend: str
    status: str
    antal_svar: int | None = None
    ar: list[str] = []


class ImportResultat(BaseModel):
    """Sammanfattning av en import, med rad per förvaltning."""

    skapade: int
    uppdaterade: int
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
    budget_helar: float | None = None
    budget_ack: float | None = None
    utfall: float | None = None
    utfall_fg: float | None = None
    prognos: float | None = None


class EkonomiOmrade(BaseModel):
    """Nettokostnad nedbruten på ett verksamhetsområde (klartextnamn ofta okänt ännu)."""

    omrade_kod: str | None = None
    namn: str | None = None
    utfall: float | None = None
    budget_ack: float | None = None


class EkonomiSeriePunkt(BaseModel):
    """Nettokostnad (RR.005) en rapportperiod — en punkt i månadsserien (mnkr)."""

    period: str
    budget_helar: float | None = None
    budget_ack: float | None = None
    utfall: float | None = None
    utfall_fg: float | None = None
    prognos: float | None = None


class EkonomiEnhet(BaseModel):
    """En förvaltning: huvudmått (per mått_kod) + nettokostnad per område."""

    kod: str
    namn: str
    niva: str = "förvaltning"
    matt: dict[str, EkonomiMatt]
    omrade: list[EkonomiOmrade] = []
    # Månadsserie av nettokostnad över flera rapportperioder (tom = bara senaste perioden).
    serie: list[EkonomiSeriePunkt] = []


class EkonomiImport(BaseModel):
    """Normaliserad importpayload för ekonomi (per förvaltning)."""

    kpi: str = "ekonomi"
    period: str = ""
    kalla: str = ""
    enheter: list[EkonomiEnhet]


class EkonomiCsvSerie(BaseModel):
    """Flera CSV-perioder i ett anrop → månadsserie. En rå CSV-text per rapportperiod."""

    perioder: list[str]
    kalla: str = "Ekonomisk uppföljning (Qlik-export, CSV)"


class EkonomiPost(BaseModel):
    """En rad i den råa ekonomirapporten (long-format)."""

    period: str | None = None
    enhet_kod: str
    enhet_namn: str
    niva: str
    matt_kod: str
    matt_namn: str
    matt_typ: str
    omrade_kod: str | None = None
    kolumn_kod: str
    kolumn_namn: str
    matvarde_mnkr: float | None = None


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
    varde: float | None = None


class SjukPunkt(BaseModel):
    """Sjukfrånvaro en period: total %, kvinnors andel %, mäns andel % (för tidsserien)."""

    period: str
    total: float | None = None
    kvinnor: float | None = None
    man: float | None = None


class SjukEnhet(BaseModel):
    """En förvaltnings sjukfrånvaro: senaste periodens värden + tidsserie."""

    kod: str
    namn: str
    period: str = ""
    total: float | None = None
    kvinnor: float | None = None
    man: float | None = None
    langtidsandel: float | None = None
    aldersgrupper: list[SjukAldersgrupp] = []
    serie: list[SjukPunkt] = []


class SjukImport(BaseModel):
    """Normaliserad importpayload för sjukfrånvaro (per förvaltning)."""

    kpi: str = "sjukfranvaro"
    period: str = ""
    kalla: str = ""
    enheter: list[SjukEnhet]


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


class DialogueArea(BaseModel):
    """Ett område i en dialog: referensdata + mätvärde + aktiviteter.

    Allt frontend behöver för ett KPI-kort och dialogpanelen, i ett objekt.
    """

    area: KpiAreaOut
    measurement: MeasurementOut
    activities: list[ActivityOut] = []


class PersonOut(ORMModel):
    id: int
    namn: str
    roll: str
    initialer: str


class OrganisationOut(ORMModel):
    id: int
    namn: str
    slug: str


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
