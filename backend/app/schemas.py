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
    trend_dir: TrendDir
    trend_good: bool
    trend_text: str
    interpretation: str


class AgreementOut(ORMModel):
    id: int
    text: str
    ansvarig: str
    klart_senast: date | None
    genomgangen: bool
    updated_at: datetime


class AgreementUpsert(BaseModel):
    """Indata för att spara/uppdatera en överenskommelse."""

    text: str = ""
    ansvarig: str = ""
    klart_senast: date | None = None


class AreaReviewPatch(BaseModel):
    """Indata för att markera ett område som genomgånget eller ångra."""

    genomgangen: bool


class DialogueArea(BaseModel):
    """Ett område i en dialog: referensdata + mätvärde + ev. överenskommelse.

    Allt frontend behöver för ett KPI-kort och dialogpanelen, i ett objekt.
    """

    area: KpiAreaOut
    measurement: MeasurementOut
    agreement: AgreementOut | None


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
    progress_total: int
    progress_done: int


class DialogueSummary(BaseModel):
    """Listrad: org, chef, period, status, progress."""

    id: int
    period: str
    status: str
    organisation: OrganisationOut
    ansvarig_chef: PersonOut
    progress_total: int
    progress_done: int
