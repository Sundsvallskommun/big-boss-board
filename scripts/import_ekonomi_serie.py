#!/usr/bin/env python3
"""Skicka en HEL månadsserie av ekonomidata till import-endpointen.

Skickar Qlik-uttag (CSV/TXT) från en mapp till `/api/import/ekonomi-filer`.
Backend läser rapportperioden ur innehållet och prioriterar senaste ordinarie uttag
dag 1–9 månaden efter perioden. Inlästa månader uppdateras, övrig historik bevaras.
Senaste underlaget per förvaltning blir huvudvärde i prognosdialogen.

    IMPORT_TOKEN=... python3 scripts/import_ekonomi_serie.py --url http://localhost:3000
    IMPORT_TOKEN=... python3 scripts/import_ekonomi_serie.py --url https://bbb.sundsvall.dev

Filurval och normalisering ägs av backend. Endast Python-stdlib (urllib). Endpointen upsertar, så skriptet är säkert att köra om.
Ekonomidatan versionshanteras aldrig (mappen är gitignorerad) — den matas in så här.
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
DEFAULT_DIR = ROOT / "ekonomi-indata"


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

    files = sorted([*args.dir.glob("*.csv"), *args.dir.glob("*.txt")])
    if not files:
        raise SystemExit(f"Inga CSV-filer i {args.dir}.")

    print(f"Skickar {len(files)} filer. Backend väljer senaste ordinarie uttag per period.")
    body = json.dumps({"filer": [
        {"namn": f.name, "text": f.read_text(encoding="utf-8-sig")} for f in files
    ]}).encode("utf-8")
    endpoint = args.url.rstrip("/") + "/api/import/ekonomi-filer"
    print(f"POST {endpoint}")

    req = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {args.token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
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
