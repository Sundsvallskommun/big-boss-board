#!/usr/bin/env python3
"""Skicka HME-data till import-endpointen.

Läser den officiella HME-rapporten (JSON), normaliserar den och POSTar till
`/api/import/hme` med import-token. Körs lokalt/i CI vid ny mätning — rapportfilen
behöver aldrig läggas i repot eller på servern.

    IMPORT_TOKEN=... python3 scripts/import_hme.py --url https://bbb.sundsvall.dev

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
DEFAULT_FILE = ROOT / "indata" / "HME_totalindex.json"


def main() -> None:
    p = argparse.ArgumentParser(description="Importera HME till BBB-instansen.")
    p.add_argument("--file", type=Path, default=DEFAULT_FILE, help="Sökväg till HME-rapport (JSON).")
    p.add_argument("--url", default="http://localhost:3000", help="Bas-URL till instansen.")
    p.add_argument("--token", default=os.environ.get("IMPORT_TOKEN", ""), help="Import-token (annars env IMPORT_TOKEN).")
    p.add_argument("--delindex", type=Path, help="Separat delindexrapport (JSON).")
    args = p.parse_args()

    if not args.token:
        raise SystemExit("Saknar import-token. Sätt IMPORT_TOKEN eller använd --token.")
    if not args.file.exists():
        raise SystemExit(f"Hittar inte rapportfilen: {args.file}")

    report = json.loads(args.file.read_text(encoding="utf-8"))
    payload = {"rapport": report, "delindex": (
        json.loads(args.delindex.read_text(encoding="utf-8-sig")) if args.delindex else None
    )}

    endpoint = args.url.rstrip("/") + "/api/import/hme-rapport"
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {args.token}"},
    )
    print(f"POST {endpoint} — {len(payload['forvaltningar'])} förvaltningar")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for r in data.get("forvaltningar", []):
            print(
                f"  {r['namn']:42} {r['value']:>4} ({r['senaste_ar']})  "
                f"{r['trend']:<22} {str(r.get('antal_svar')):>5} svar  [{r['atgard']}]"
            )
        print(f"OK: {data['skapade']} skapade, {data['uppdaterade']} uppdaterade.")
    except urllib.error.HTTPError as e:
        print(f"FEL {e.code}: {e.read().decode('utf-8', 'replace')}", file=sys.stderr)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
