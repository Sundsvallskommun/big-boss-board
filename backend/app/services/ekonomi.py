"""Ekonomins bedömning: helårsprognos minus helårsbudget, i mnkr.

Samma definition används vid import och när redan lagrade mätvärden läses.
Noll i källans budget/prognos betyder att underlaget ännu inte har fyllts på.
"""
from dataclasses import dataclass
from math import isfinite

from app.models import Status


@dataclass(frozen=True)
class EkonomiBedomning:
    diff: float | None
    status: Status | None
    text: str
    tolkning: str


def bedom_ekonomi(budget: float | None, prognos: float | None) -> EkonomiBedomning:
    if not budget or not prognos or not isfinite(budget) or not isfinite(prognos):
        return EkonomiBedomning(
            None, None, "–",
            "Helårsbudget och helårsprognos finns inte båda för perioden. "
            "Det går ännu inte att bedöma om budgeten håller.",
        )
    diff = round(prognos - budget, 1)
    belopp = f"{abs(diff):.1f}".removesuffix(".0").replace(".", ",") + " mnkr"
    if diff < 0:
        return EkonomiBedomning(
            diff, Status.alert, f"−{belopp}",
            f"Prognosen pekar mot ett underskott på {belopp} vid årets slut. "
            "Ta ställning till vilka åtgärder som krävs och följ upp tätare.",
        )
    if diff > 0:
        return EkonomiBedomning(
            diff, Status.good, f"+{belopp}",
            f"Prognosen pekar mot ett överskott på {belopp} vid årets slut.",
        )
    return EkonomiBedomning(0, Status.good, "±0 mnkr", "Prognosen pekar mot en budget i balans vid årets slut.")


@dataclass(frozen=True)
class Prognoskorrigering:
    kod: str
    period: str
    budget: float
    prognos: float
    orsak: str


# Dokumenterad rättning av saknad prognos. Omprövas när källans export
# av april 2026 rättas; får aldrig träffa andra perioder eller en annan budget.
APRIL_2026 = Prognoskorrigering(
    "24", "2026-04-30", -2972.31, -2972.31,
    "Prognos inlämnad efter uttagsfönstret. Satt till helårsbudget enligt "
    "avstämning med ekonom 2026-08-14 (källcommit 792b7b9).",
)


def korrigering_for(
    kod: str, period: str, budget: float | None, prognos: float | None,
) -> Prognoskorrigering | None:
    if (kod, period) != (APRIL_2026.kod, APRIL_2026.period):
        return None
    # Ett faktiskt källvärde har företräde framför den tidsbegränsade ersättningen.
    if prognos is not None and prognos != 0:
        return None
    if budget is None or abs(budget - APRIL_2026.budget) > 0.005:
        raise ValueError("Aprilrättningen för Barn och utbildning kräver omprövning: budgeten har ändrats.")
    return APRIL_2026
