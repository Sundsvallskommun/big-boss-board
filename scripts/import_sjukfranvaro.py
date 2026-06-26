#!/usr/bin/env python3
"""Skicka sjukfrånvarodata (personal-CSV) till import-endpointen.

Läser den råa Qlik-CSV:n och POSTar den till `/api/import/sjukfranvaro-csv` med import-token.
Normaliseringen sker server-side. Endast Python-stdlib. Endpointen upsertar (säkert att köra om).

    IMPORT_TOKEN=... python3 scripts/import_sjukfranvaro.py --url https://bbb.sundsvall.dev
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_FILE = ROOT / "indata" / "kpidata_Personal_forvaltning_2026-06-26.csv"


def main() -> None:
    p = argparse.ArgumentParser(description="Importera sjukfrånvaro (personal-CSV) till BBB.")
    p.add_argument("--file", type=Path, default=DEFAULT_FILE, help="Sökväg till personal-CSV.")
    p.add_argument("--url", default="http://localhost:3000", help="Bas-URL till instansen.")
    p.add_argument("--token", default=os.environ.get("IMPORT_TOKEN", ""), help="Import-token (annars env IMPORT_TOKEN).")
    args = p.parse_args()

    if not args.token:
        raise SystemExit("Saknar import-token. Sätt IMPORT_TOKEN eller använd --token.")
    if not args.file.exists():
        raise SystemExit(f"Hittar inte filen: {args.file}")

    body = args.file.read_text(encoding="utf-8-sig").encode("utf-8")
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
