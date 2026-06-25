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
