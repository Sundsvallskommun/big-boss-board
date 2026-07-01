#!/usr/bin/env python3
"""Läs och triagera inkorgen (inkomna synpunkter/frågor/aktiviteter).

Hämtar inlämningar från den token-skyddade admin-endpointen och skriver ut dem.
Används av arbetsgruppen för att gå igenom inkomna poster (t.ex. tillsammans med
Claude) innan något knådas färdigt och publiceras på status-sidan.

    # Lista nya inlämningar
    IMPORT_TOKEN=... python3 scripts/read_inbox.py --url https://bbb.sundsvall.dev

    # Lista alla (inkl. redan triagerade)
    IMPORT_TOKEN=... python3 scripts/read_inbox.py --url ... --status alla

    # Markera en inlämning som granskad (eller publicerad/arkiverad), ev. med notering
    IMPORT_TOKEN=... python3 scripts/read_inbox.py --url ... \
        --set 12 granskad --notering "Slås ihop med #4"

Endast Python-stdlib (urllib). Endpointerna är idempotenta nog att köra om.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

ALLOWED_STATUS = ("ny", "granskad", "publicerad", "arkiverad")


def _request(method: str, url: str, token: str, body: dict | None = None) -> object:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Authorization": f"Bearer {token}"}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detalj = exc.read().decode("utf-8", "replace")
        raise SystemExit(f"HTTP {exc.code} mot {url}: {detalj}")
    except urllib.error.URLError as exc:
        raise SystemExit(f"Kunde inte nå {url}: {exc.reason}")


def _print_submission(s: dict) -> None:
    print(f"#{s['id']}  [{s['status']}]  {s['skapad_at']}")
    print(f"    {s['text']}")
    if s.get("notering"):
        print(f"    ↳ notering: {s['notering']}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", required=True, help="Bas-URL, t.ex. https://bbb.sundsvall.dev")
    parser.add_argument(
        "--status",
        default="ny",
        help="Filtrera listan på status (ny/granskad/publicerad/arkiverad) eller 'alla'. Standard: ny.",
    )
    parser.add_argument(
        "--set",
        nargs=2,
        metavar=("ID", "STATUS"),
        help="Sätt status på en inlämning, t.ex. --set 12 granskad.",
    )
    parser.add_argument("--notering", default=None, help="Intern notering att spara vid --set.")
    parser.add_argument("--json", action="store_true", help="Skriv ut rådata som JSON.")
    args = parser.parse_args()

    token = os.environ.get("IMPORT_TOKEN")
    if not token:
        raise SystemExit("Sätt IMPORT_TOKEN i miljön (samma token som import-endpointen).")

    base = args.url.rstrip("/")

    if args.set:
        sub_id, ny_status = args.set
        if ny_status not in ALLOWED_STATUS:
            raise SystemExit(f"Ogiltig status '{ny_status}'. Tillåtna: {', '.join(ALLOWED_STATUS)}.")
        body: dict[str, str] = {"status": ny_status}
        if args.notering is not None:
            body["notering"] = args.notering
        result = _request("PATCH", f"{base}/api/admin/submissions/{sub_id}", token, body)
        print("Uppdaterad:")
        _print_submission(result)  # type: ignore[arg-type]
        return

    query = "" if args.status == "alla" else f"?status={args.status}"
    result = _request("GET", f"{base}/api/admin/submissions{query}", token)
    items: list[dict] = result  # type: ignore[assignment]

    if args.json:
        print(json.dumps(items, ensure_ascii=False, indent=2))
        return

    if not items:
        etikett = "alla statusar" if args.status == "alla" else f"status '{args.status}'"
        print(f"Inga inlämningar med {etikett}.")
        return

    print(f"{len(items)} inlämning(ar):\n")
    for s in items:
        _print_submission(s)


if __name__ == "__main__":
    main()
