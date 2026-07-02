#!/usr/bin/env python3
"""Skicka sjukfrånvarodata (personal-CSV från Qlik) till import-endpointen.

Läser alla CSV-uttag i en mapp (t.ex. `sjukfranvaro-indata/`), grupperar dem på
rapportperiod (kolumnen `Period` i filen — inte filnamnets uttagsdatum), väljer det
SENASTE (mest kompletta) dagsuttaget per period, slår ihop de valda perioderna till
EN CSV och POSTar den till `/api/import/sjukfranvaro-csv`. Backend bygger en tidsserie
per förvaltning; senaste perioden blir kortets huvudvärde och serien ritas i grafen.

    IMPORT_TOKEN=... python3 scripts/import_sjukfranvaro.py --url http://localhost:3000
    IMPORT_TOKEN=... python3 scripts/import_sjukfranvaro.py --url https://bbb.sundsvall.dev

Rapportperiod ≠ uttagsdatum: filens `Period`-kolumn är månadsstängningen (t.ex.
`2026-04-30`); filnamnets datum är dagsuttaget. Flera uttag per period — det sista är
mest komplett. Endast Python-stdlib (urllib/csv). Endpointen upsertar, så skriptet är
säkert att köra om. Sjukfrånvarodatan versionshanteras aldrig (mappen är gitignorerad).
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DIR = ROOT / "sjukfranvaro-indata"
DATE_RE = re.compile(r"(\d{4}-\d{2}-\d{2})")


def _extract_date(name: str) -> str:
    """Dagsuttagets datum ur filnamnet (t.ex. 'kpidata_..._2026-06-26.csv' → '2026-06-26')."""
    m = DATE_RE.search(name)
    return m.group(1) if m else ""


def _combine_latest_per_period(files: list[Path]) -> tuple[str, dict[str, tuple[str, int]]]:
    """Slå ihop CSV-uttagen till en CSV med det senaste uttaget per rapportperiod.

    Returnerar (combined_csv_text, {period: (uttagsdatum, antal_rader)}) sorterat på period.
    """
    header = "Period,Enhet,Mått,Kolumn,Mätvärde"
    # period -> (uttagsdatum, [datarader]) — senaste uttaget vinner per period.
    best: dict[str, tuple[str, list[str]]] = {}
    for f in files:
        date = _extract_date(f.name)
        text = f.read_text(encoding="utf-8-sig")
        lines = [ln for ln in text.splitlines() if ln.strip()]
        if not lines:
            continue
        if lines[0].lstrip("﻿").startswith("Period"):
            header = lines[0].lstrip("﻿")
            rows = lines[1:]
        else:
            rows = lines
        by_period: dict[str, list[str]] = {}
        for r in rows:
            period = r.split(",", 1)[0].strip()
            by_period.setdefault(period, []).append(r)
        for period, prows in by_period.items():
            prev = best.get(period)
            if prev is None or date >= prev[0]:
                best[period] = (date, prows)

    out = [header]
    meta: dict[str, tuple[str, int]] = {}
    for period in sorted(best):
        date, prows = best[period]
        out.extend(prows)
        meta[period] = (date, len(prows))
    return "\n".join(out) + "\n", meta


def main() -> None:
    p = argparse.ArgumentParser(description="Importera sjukfrånvaro (personal-CSV) till BBB.")
    p.add_argument("--dir", type=Path, default=DEFAULT_DIR, help="Mapp med CSV-uttag (Qlik-export).")
    p.add_argument("--url", default="http://localhost:3000", help="Bas-URL till instansen.")
    p.add_argument("--token", default=os.environ.get("IMPORT_TOKEN", ""), help="Import-token (annars env IMPORT_TOKEN).")
    args = p.parse_args()

    if not args.token:
        raise SystemExit("Saknar import-token. Sätt IMPORT_TOKEN eller använd --token.")
    if not args.dir.is_dir():
        raise SystemExit(f"Hittar inte mappen: {args.dir}")

    files = sorted(args.dir.glob("*.csv"))
    if not files:
        raise SystemExit(f"Inga CSV-filer i {args.dir}.")

    body_csv, meta = _combine_latest_per_period(files)
    if not meta:
        raise SystemExit("Kunde inte läsa någon rapportperiod ur filerna.")

    print(f"Hittade {len(files)} filer → {len(meta)} rapportperioder (senaste uttag per period):")
    for period, (date, n) in meta.items():
        print(f"  {period}  (uttag {date}, {n} rader)")

    body = body_csv.encode("utf-8")
    endpoint = args.url.rstrip("/") + "/api/import/sjukfranvaro-csv"
    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={"Content-Type": "text/csv", "Authorization": f"Bearer {args.token}"},
    )
    print(f"POST {endpoint}")
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for r in data.get("enheter", []):
            print(f"  {r['namn']:42} {str(r.get('value') or '–'):>10}  [{r['atgard']}]")
        print(
            f"OK: {data['skapade']} skapade, {data['uppdaterade']} uppdaterade, "
            f"{data['hoppade_over']} hoppade över."
        )
    except urllib.error.HTTPError as e:
        print(f"FEL {e.code}: {e.read().decode('utf-8', 'replace')}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
