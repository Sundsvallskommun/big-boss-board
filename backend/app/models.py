"""SQLAlchemy-modeller (2.0, typed) för Big Boss Board.

Referenstabeller (organisation, person, support_function, tool, kpi_area, question)
gör innehållet redigerbart utan kodändring. Transaktionstabeller (dialogue,
measurement, agreement) bär själva uppföljningen.

Endast öppen och publik information — inga personuppgifter (även dummydata är fiktiv).
"""

from __future__ import annotations

import enum
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Status(str, enum.Enum):
    """KPI-status, skild från färg (färgsättning sker i frontend mot designsystemet)."""

    good = "good"
    warn = "warn"
    alert = "alert"


class TrendDir(str, enum.Enum):
    up = "up"
    down = "down"


class Organisation(Base):
    __tablename__ = "organisation"

    id: Mapped[int] = mapped_column(primary_key=True)
    namn: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True)

    dialogues: Mapped[list[Dialogue]] = relationship(back_populates="organisation")


class Person(Base):
    __tablename__ = "person"

    id: Mapped[int] = mapped_column(primary_key=True)
    namn: Mapped[str] = mapped_column(String(200))
    roll: Mapped[str] = mapped_column(String(200))
    initialer: Mapped[str] = mapped_column(String(8))


class SupportFunction(Base):
    """Stödfunktion (Ekonomi, HR, Kommunikation, Verksamhet, Digitalisering)."""

    __tablename__ = "support_function"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    namn: Mapped[str] = mapped_column(String(120))
    ikon: Mapped[str] = mapped_column(String(64))

    tools: Mapped[list[Tool]] = relationship(
        back_populates="support_function", order_by="Tool.ordning"
    )
    kpi_areas: Mapped[list[KpiArea]] = relationship(back_populates="support_function")


class Tool(Base):
    """Post i verktygslådan, kopplad till en stödfunktion."""

    __tablename__ = "tool"

    id: Mapped[int] = mapped_column(primary_key=True)
    support_function_id: Mapped[int] = mapped_column(ForeignKey("support_function.id"))
    namn: Mapped[str] = mapped_column(String(160))
    ordning: Mapped[int] = mapped_column(Integer, default=0)

    support_function: Mapped[SupportFunction] = relationship(back_populates="tools")


class KpiArea(Base):
    """Ett av nyckeltalsområdena (referensdata)."""

    __tablename__ = "kpi_area"

    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    namn: Mapped[str] = mapped_column(String(160))
    short: Mapped[str | None] = mapped_column(String(32), nullable=True)
    ikon: Mapped[str] = mapped_column(String(64))
    lower_better: Mapped[bool] = mapped_column(Boolean, default=False)
    support_function_id: Mapped[int] = mapped_column(ForeignKey("support_function.id"))
    ordning: Mapped[int] = mapped_column(Integer, default=0)

    support_function: Mapped[SupportFunction] = relationship(back_populates="kpi_areas")
    questions: Mapped[list[Question]] = relationship(
        back_populates="kpi_area", order_by="Question.ordning"
    )


class Question(Base):
    """Samtalsstöd (fråga) per område."""

    __tablename__ = "question"

    id: Mapped[int] = mapped_column(primary_key=True)
    kpi_area_id: Mapped[int] = mapped_column(ForeignKey("kpi_area.id"))
    text: Mapped[str] = mapped_column(Text)
    ordning: Mapped[int] = mapped_column(Integer, default=0)

    kpi_area: Mapped[KpiArea] = relationship(back_populates="questions")


class Dialogue(Base):
    """En uppföljningsdialog (org + ansvarig chef + period)."""

    __tablename__ = "dialogue"

    id: Mapped[int] = mapped_column(primary_key=True)
    organisation_id: Mapped[int] = mapped_column(ForeignKey("organisation.id"))
    ansvarig_chef_id: Mapped[int] = mapped_column(ForeignKey("person.id"))
    period: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="pagaende")
    skapad_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    organisation: Mapped[Organisation] = relationship(back_populates="dialogues")
    ansvarig_chef: Mapped[Person] = relationship()
    measurements: Mapped[list[Measurement]] = relationship(back_populates="dialogue")
    agreements: Mapped[list[Agreement]] = relationship(back_populates="dialogue")


class Measurement(Base):
    """Utfall per område och dialog."""

    __tablename__ = "measurement"
    __table_args__ = (UniqueConstraint("dialogue_id", "kpi_area_id", name="uq_measurement_area"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    dialogue_id: Mapped[int] = mapped_column(ForeignKey("dialogue.id"))
    kpi_area_id: Mapped[int] = mapped_column(ForeignKey("kpi_area.id"))
    value_text: Mapped[str] = mapped_column(String(64))
    value_num: Mapped[float] = mapped_column(Float)
    unit: Mapped[str] = mapped_column(String(32), default="")
    target_text: Mapped[str] = mapped_column(String(64))
    target_num: Mapped[float] = mapped_column(Float)
    bar_max: Mapped[float] = mapped_column(Float, default=100)
    status: Mapped[Status] = mapped_column(Enum(Status, name="status"))
    trend_dir: Mapped[TrendDir] = mapped_column(Enum(TrendDir, name="trend_dir"))
    trend_good: Mapped[bool] = mapped_column(Boolean)
    trend_text: Mapped[str] = mapped_column(String(120))
    interpretation: Mapped[str] = mapped_column(Text)

    dialogue: Mapped[Dialogue] = relationship(back_populates="measurements")
    kpi_area: Mapped[KpiArea] = relationship()


class Agreement(Base):
    """Överenskommelse/nästa steg per område och dialog. Bär även genomgången-status."""

    __tablename__ = "agreement"
    __table_args__ = (UniqueConstraint("dialogue_id", "kpi_area_id", name="uq_agreement_area"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    dialogue_id: Mapped[int] = mapped_column(ForeignKey("dialogue.id"))
    kpi_area_id: Mapped[int] = mapped_column(ForeignKey("kpi_area.id"))
    text: Mapped[str] = mapped_column(Text, default="")
    ansvarig: Mapped[str] = mapped_column(String(200), default="")
    klart_senast: Mapped[date | None] = mapped_column(Date, nullable=True)
    genomgangen: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    dialogue: Mapped[Dialogue] = relationship(back_populates="agreements")
    kpi_area: Mapped[KpiArea] = relationship()
