#!/usr/bin/env python3
"""Skicka ekonomidata till import-endpointen.

Läser den råa ekonomirapporten (resultaträkning, long-format JSON) och POSTar den till
`/api/import/ekonomi` med import-token. Normaliseringen sker server-side. Körs lokalt/i CI
vid ny period — rapportfilen behöver aldrig läggas i repot eller på servern.

    IMPORT_TOKEN=... python3 scripts/import_ekonomi.py --url https://bbb.sundsvall.dev

Endast Python-stdlib (urllib). Endpointen upsertar, så skriptet är säkert att köra om.
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
DEFAULT_FILE = ROOT / "indata" / "ekonomi-test.json"


def main() -> None:
    p = argparse.ArgumentParser(description="Importera ekonomidata till BBB-instansen.")
    p.add_argument("--file", type=Path, default=DEFAULT_FILE, help="Sökväg till ekonomirapport (JSON).")
    p.add_argument("--url", default="http://localhost:3000", help="Bas-URL till instansen.")
    p.add_argument("--token", default=os.environ.get("IMPORT_TOKEN", ""), help="Import-token (annars env IMPORT_TOKEN).")
    args = p.parse_args()

    if not args.token:
        raise SystemExit("Saknar import-token. Sätt IMPORT_TOKEN eller använd --token.")
    if not args.file.exists():
        raise SystemExit(f"Hittar inte rapportfilen: {args.file}")

    if args.file.suffix.lower() == ".csv":
        # Qlik CSV-export: rå CSV postas, normaliseras server-side.
        body = args.file.read_text(encoding="utf-8-sig").encode("utf-8")
        endpoint = args.url.rstrip("/") + "/api/import/ekonomi-csv"
        content_type = "text/csv"
        antal = sum(1 for _ in args.file.read_text(encoding="utf-8-sig").splitlines()) - 1
        print(f"POST {endpoint} — {antal} CSV-rader")
    else:
        rapport = json.loads(args.file.read_text(encoding="utf-8"))
        if not isinstance(rapport.get("poster"), list):
            raise SystemExit("Filen saknar 'poster' — ser inte ut som en ekonomirapport.")
        body = json.dumps(rapport).encode("utf-8")
        endpoint = args.url.rstrip("/") + "/api/import/ekonomi"
        content_type = "application/json"
        print(f"POST {endpoint} — {len(rapport['poster'])} poster")

    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={"Content-Type": content_type, "Authorization": f"Bearer {args.token}"},
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
