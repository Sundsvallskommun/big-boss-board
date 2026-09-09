#!/usr/bin/env python3
"""Skicka sjukfrånvarodata (personal-CSV från Qlik) till import-endpointen.

Skickar CSV/TXT-uttag till /api/import/sjukfranvaro-filer. Backend validerar R12,
väljer senaste uttag per mätpunkt och bevarar historiken.

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
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DIR = ROOT / "sjukfranvaro-indata"
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

    files = sorted([*args.dir.glob("*.csv"), *args.dir.glob("*.txt")])
    if not files:
        raise SystemExit(f"Inga CSV-filer i {args.dir}.")

    print(f"Skickar {len(files)} filer; backend väljer senaste uttag och validerar R12.")
    body = json.dumps({"filer": [
        {"namn": f.name, "text": f.read_text(encoding="utf-8-sig")} for f in files
    ]}).encode("utf-8")
    endpoint = args.url.rstrip("/") + "/api/import/sjukfranvaro-filer"
    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {args.token}"},
    )
    print(f"POST {endpoint}")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
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
