#!/usr/bin/env python3
"""Skicka en HEL månadsserie av ekonomidata till import-endpointen.

Läser alla Qlik-CSV-uttag i en mapp (t.ex. `ekonomi-indata/`), grupperar dem på
rapportperiod (kolumnen `Period` i filen — inte filnamnets uttagsdatum), väljer det
SENASTE (mest kompletta) dagsuttaget per period, och POSTar hela serien till
`/api/import/ekonomi-serie`. Backend bygger en månadsserie per förvaltning; senaste
perioden blir kortets huvudvärde och serien ritas i nettokostnadsdiagrammet.

    IMPORT_TOKEN=... python3 scripts/import_ekonomi_serie.py --url http://localhost:3000
    IMPORT_TOKEN=... python3 scripts/import_ekonomi_serie.py --url https://bbb.sundsvall.dev

Endast Python-stdlib (urllib/csv). Endpointen upsertar, så skriptet är säkert att köra om.
Ekonomidatan versionshanteras aldrig (mappen är gitignorerad) — den matas in så här.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DIR = ROOT / "ekonomi-indata"


def _period_of(text: str) -> str:
    """Läs rapportperioden (första dataradens Period) ur en CSV-text."""
    reader = csv.DictReader(io.StringIO(text))
    for row in reader:
        period = (row.get("Period") or "").strip()
        if period:
            return period
    return ""


def _latest_per_period(files: list[Path]) -> list[tuple[str, str]]:
    """Gruppera på rapportperiod, behåll det senaste uttaget (max filnamn) per period.

    Returnerar (period, csv_text) sorterat kronologiskt (äldst först).
    """
    best: dict[str, tuple[str, str]] = {}  # period -> (filnamn, text)
    for f in sorted(files):
        text = f.read_text(encoding="utf-8-sig")
        period = _period_of(text)
        if not period:
            print(f"  hoppar över {f.name} — hittar ingen Period.", file=sys.stderr)
            continue
        # sorted() ger stigande filnamn → sista vinner = senaste uttaget för perioden.
        best[period] = (f.name, text)
    return [(period, text) for period, (_, text) in sorted(best.items())]


def main() -> None:
    p = argparse.ArgumentParser(description="Importera en ekonomi-månadsserie till BBB-instansen.")
    p.add_argument("--dir", type=Path, default=DEFAULT_DIR, help="Mapp med CSV-uttag (Qlik-export).")
    p.add_argument("--url", default="http://localhost:3000", help="Bas-URL till instansen.")
    p.add_argument("--token", default=os.environ.get("IMPORT_TOKEN", ""), help="Import-token (annars env IMPORT_TOKEN).")
    args = p.parse_args()

    if not args.token:
        raise SystemExit("Saknar import-token. Sätt IMPORT_TOKEN eller använd --token.")
    if not args.dir.is_dir():
        raise SystemExit(f"Hittar inte mappen: {args.dir}")

    files = list(args.dir.glob("*.csv"))
    if not files:
        raise SystemExit(f"Inga CSV-filer i {args.dir}.")

    valda = _latest_per_period(files)
    if not valda:
        raise SystemExit("Kunde inte läsa någon rapportperiod ur filerna.")

    print(f"Hittade {len(files)} filer → {len(valda)} rapportperioder:")
    for period, _ in valda:
        print(f"  {period}")

    body = json.dumps({"perioder": [text for _, text in valda]}).encode("utf-8")
    endpoint = args.url.rstrip("/") + "/api/import/ekonomi-serie"
    print(f"POST {endpoint}")

    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {args.token}"},
    )
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for r in data.get("enheter", []):
            print(f"  {r['namn']:42} {str(r.get('value') or '–'):>14}  [{r['atgard']}]")
        print(
            f"OK: {data['skapade']} skapade, {data['uppdaterade']} uppdaterade, "
            f"{data['hoppade_over']} hoppade över."
        )
    except urllib.error.HTTPError as e:
        print(f"FEL {e.code}: {e.read().decode('utf-8', 'replace')}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
