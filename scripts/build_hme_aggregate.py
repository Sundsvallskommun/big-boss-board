#!/usr/bin/env python3
"""Bygg HME-aggregat från medarbetarundersökningens råfil.

Läser den anonymiserade undersökningsfilen i ``indata/`` och skriver
``backend/app/data/hme_2025.json`` med *endast* aggregat per förvaltning —
aldrig radnivådata. Aggregatet konsumeras av ``backend/app/seed.py``.

Kör manuellt vid behov (engångs-/uppdateringssteg, ej en del av runtime)::

    python3 scripts/build_hme_aggregate.py

Endast Python-stdlib (zipfile + xml) — .xlsx är en zip av XML, så ingen
pandas/openpyxl behövs.

HME-metod (SKR): varje delfråga besvaras på en 1–5-skala. Delindex per
dimension = (medel − 1) / 4 × 100. Totalt HME-index = medel av de tre
delindexen (Motivation, Styrning, Ledarskap).

Datastyrning: ett segment (chef/medarbetare) som bygger på färre än
``MIN_SEGMENT_N`` svar kan i praktiken peka ut en enskild person. Om något
segment understiger gränsen utelämnas BÅDA segmenten för förvaltningen
(annars kan det lilla segmentet räknas tillbaka ur totalen). Totalindexet
visas alltid (minsta förvaltning har långt fler svar än så).
"""

from __future__ import annotations

import json
import re
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from xml.etree.ElementTree import iterparse

# --- Sökvägar -------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "indata" / "HME_2025_Ej_personuppgifter_Forvaltningsniva.xlsx"
OUT = ROOT / "backend" / "app" / "data" / "hme_2025.json"

# --- Kolumn- och dimensionskarta (verifierad mot filens rubrikrad) --------
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
DIMENSIONS = {
    "motivation": ["B", "C", "D"],  # Motivation - …
    "styrning": ["E", "F", "G"],    # Styrning - …
    "ledarskap": ["H", "I", "J"],   # Ledarskap - …
}
HME_COLS = [c for cols in DIMENSIONS.values() for c in cols]
COL_KONCERN = "CN"      # Org.nivå 1
COL_FORVALTNING = "CO"  # Org.nivå 2
COL_AR_CHEF = "CM"      # Är chef (Ja/Nej)

AR = 2025
MIN_SEGMENT_N = 5

_COL_RE = re.compile(r"[A-Z]+")
_DIGIT_RE = re.compile(r"^\s*(\d+)")


def _col(ref: str) -> str:
    return _COL_RE.match(ref).group()


def _shared_strings(z: zipfile.ZipFile) -> list[str]:
    root = ET.fromstring(z.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in si.iter(NS + "t")) for si in root.iter(NS + "si")]


class Accumulator:
    """Summa och antal per delfråga, för att kunna räkna medel och index."""

    def __init__(self) -> None:
        self.n = 0  # antal respondenter med minst ett HME-svar
        self.sums: dict[str, int] = {c: 0 for c in HME_COLS}
        self.counts: dict[str, int] = {c: 0 for c in HME_COLS}

    def add(self, answers: dict[str, int]) -> None:
        if not answers:
            return
        self.n += 1
        for col, val in answers.items():
            self.sums[col] += val
            self.counts[col] += 1

    def _dim_index(self, cols: list[str]) -> float | None:
        total = sum(self.sums[c] for c in cols)
        count = sum(self.counts[c] for c in cols)
        if count == 0:
            return None
        return round(((total / count) - 1) / 4 * 100, 1)

    def result(self) -> dict | None:
        delindex = {dim: self._dim_index(cols) for dim, cols in DIMENSIONS.items()}
        if any(v is None for v in delindex.values()):
            return None
        hme_total = round(sum(delindex.values()) / len(delindex), 1)
        return {"n": self.n, "hme_total": hme_total, "delindex": delindex}


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"Hittar inte källfilen: {SOURCE}")

    z = zipfile.ZipFile(SOURCE)
    strings = _shared_strings(z)

    # förvaltning -> {"alla": Acc, "chef": Acc, "medarbetare": Acc}
    forv: dict[str, dict[str, Accumulator]] = {}
    koncern_by_forv: dict[str, str] = {}

    with z.open("xl/worksheets/sheet1.xml") as fh:
        cells: dict[str, str] = {}
        for _, el in iterparse(fh):
            tag = el.tag.replace(NS, "")
            if tag == "c":
                ref = el.attrib["r"]
                v = el.find(NS + "v")
                val = v.text if v is not None else None
                if el.attrib.get("t") == "s" and val is not None:
                    val = strings[int(val)]
                cells[_col(ref)] = val
                el.clear()
            elif tag == "row":
                r = int(el.attrib["r"])
                el.clear()
                if r == 1:  # rubrikrad
                    cells = {}
                    continue
                forv_namn = (cells.get(COL_FORVALTNING) or "").strip()
                if forv_namn:
                    answers: dict[str, int] = {}
                    for col in HME_COLS:
                        m = _DIGIT_RE.match(cells.get(col) or "")
                        if m:
                            answers[col] = int(m.group(1))
                    bucket = forv.setdefault(
                        forv_namn,
                        {"alla": Accumulator(), "chef": Accumulator(), "medarbetare": Accumulator()},
                    )
                    bucket["alla"].add(answers)
                    seg = "chef" if (cells.get(COL_AR_CHEF) or "").strip().lower() == "ja" else "medarbetare"
                    bucket[seg].add(answers)
                    koncern_by_forv.setdefault(forv_namn, (cells.get(COL_KONCERN) or "").strip())
                cells = {}

    forvaltningar = []
    for namn in sorted(forv, key=lambda k: -forv[k]["alla"].n):
        acc = forv[namn]
        total = acc["alla"].result()
        if total is None:
            continue

        chef = acc["chef"].result()
        medarb = acc["medarbetare"].result()
        # n<5-suppression: utelämna BÅDA segmenten om något är för litet.
        if (
            chef is None
            or medarb is None
            or chef["n"] < MIN_SEGMENT_N
            or medarb["n"] < MIN_SEGMENT_N
        ):
            segment = None
        else:
            segment = {"chef": chef, "medarbetare": medarb}

        forvaltningar.append(
            {
                "namn": namn,
                "koncern": koncern_by_forv.get(namn, ""),
                "n": total["n"],
                "hme_total": total["hme_total"],
                "delindex": total["delindex"],
                "segment": segment,
            }
        )

    payload = {
        "kalla": SOURCE.name,
        "ar": AR,
        "metod": "SKR HME: delindex=(medel−1)/4×100, total=medel av tre delindex",
        "min_segment_n": MIN_SEGMENT_N,
        "forvaltningar": forvaltningar,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Skrev {OUT.relative_to(ROOT)} — {len(forvaltningar)} förvaltningar.")
    for f in forvaltningar:
        seg = "med segment" if f["segment"] else "segment utelämnat (n<%d)" % MIN_SEGMENT_N
        print(f"  {f['namn'][:38]:38} n={f['n']:>5}  HME={f['hme_total']:>5}  {seg}")


if __name__ == "__main__":
    main()
