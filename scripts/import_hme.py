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


def report_to_payload(report: dict) -> dict:
    """Officiella rapporten (`dimensioner.Enhet`/`Förvaltning`) → normaliserad payload."""
    dims = report.get("dimensioner", {})
    forv = dims.get("Enhet") or dims.get("Förvaltning") or []
    if not forv:
        raise SystemExit("Hittar ingen 'dimensioner.Enhet' (eller Förvaltning) i rapporten.")
    return {
        "kpi": "hme",
        "enhet": "index",
        "mal": 75,
        "kalla": "HME-mätning (officiell rapport)",
        "forvaltningar": [
            {
                "namn": f["grupp"],
                "matningar": {str(k): v for k, v in f.get("matningar", {}).items()},
                "antal_svar": f.get("antal_svar_2025"),
            }
            for f in forv
        ],
    }


def main() -> None:
    p = argparse.ArgumentParser(description="Importera HME till BBB-instansen.")
    p.add_argument("--file", type=Path, default=DEFAULT_FILE, help="Sökväg till HME-rapport (JSON).")
    p.add_argument("--url", default="http://localhost:3000", help="Bas-URL till instansen.")
    p.add_argument("--token", default=os.environ.get("IMPORT_TOKEN", ""), help="Import-token (annars env IMPORT_TOKEN).")
    args = p.parse_args()

    if not args.token:
        raise SystemExit("Saknar import-token. Sätt IMPORT_TOKEN eller använd --token.")
    if not args.file.exists():
        raise SystemExit(f"Hittar inte rapportfilen: {args.file}")

    report = json.loads(args.file.read_text(encoding="utf-8"))
    payload = report_to_payload(report)

    endpoint = args.url.rstrip("/") + "/api/import/hme"
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {args.token}"},
    )
    print(f"POST {endpoint} — {len(payload['forvaltningar'])} förvaltningar")
    try:
        with urllib.request.urlopen(req) as resp:
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
