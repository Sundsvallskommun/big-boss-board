"""Bounded transport of named exports. Business rules belong to the import API.

Used by both the local CLI scripts and the scheduled SMB job. This module only
uses the standard library so the local scripts retain their standalone usage.
"""

from __future__ import annotations

import argparse
import json
import os
import stat
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from http.client import HTTPException, HTTPMessage
from pathlib import Path
from typing import BinaryIO, Literal
from urllib.parse import urlsplit

ReportKind = Literal["ekonomi", "sjukfranvaro"]


class ImportFailure(Exception):
    """Safe, actionable message: never include credentials or response bodies."""


@dataclass(frozen=True)
class Limits:
    max_files: int = 100
    max_file_bytes: int = 2_000_000
    max_total_bytes: int = 8_000_000
    min_age_seconds: int = 300

    def __post_init__(self) -> None:
        if not 1 <= self.max_files <= 100:
            raise ImportFailure("Filgränsen måste vara mellan 1 och 100.")
        if not 1 <= self.max_file_bytes <= self.max_total_bytes <= 15_000_000:
            raise ImportFailure("Storleksgränserna måste vara positiva och sammanlagt högst 15 MB.")
        if self.min_age_seconds < 0:
            raise ImportFailure("Filernas minimiålder får inte vara negativ.")


@dataclass(frozen=True)
class FileVersion:
    size: int
    modified_ns: int
    inode: int

    def check_ready(self, limits: Limits, now: float) -> None:
        if not 0 < self.size <= limits.max_file_bytes:
            raise ImportFailure("En rapport är tom eller större än tillåten filstorlek.")
        if now - self.modified_ns / 1_000_000_000 < limits.min_age_seconds:
            raise ImportFailure("En rapport är för ny. Vänta tills exporten är färdig och kör igen.")


@dataclass(frozen=True)
class ReportFile:
    name: str
    text: str


def decode_report(name: str, content: bytes, before: FileVersion, after: FileVersion) -> ReportFile:
    if before != after or len(content) != before.size:
        raise ImportFailure("En rapport ändrades under hämtningen. Ingen import har skickats.")
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise ImportFailure("En rapport är inte UTF-8-kodad.") from None
    if not text.strip():
        raise ImportFailure("En rapport saknar innehåll.")
    return ReportFile(name, text)


def check_name(name: str) -> bool:
    """Only direct CSV/TXT files; no paths, hidden exports or recursive scans."""
    if name.startswith(".") or Path(name).suffix.lower() not in {".csv", ".txt"}:
        return False
    if len(name) > 255 or any(c in name for c in "/\\\r\n\x00"):
        raise ImportFailure("Ogiltigt rapportfilnamn.")
    return True


def check_batch_size(count: int, total: int, limits: Limits) -> None:
    if count > limits.max_files or total > limits.max_total_bytes:
        raise ImportFailure("Rapportmappen överskrider fil- eller storleksgränsen. Avgränsa underlaget.")


def read_local_reports(directory: Path, limits: Limits) -> list[ReportFile]:
    reports: list[ReportFile] = []
    total = 0
    now = time.time()
    with os.scandir(directory) as entries:
        for index, entry in enumerate(entries):
            if index >= 1000:
                raise ImportFailure("Mappen har för många poster. Använd en avgränsad rapportmapp.")
            if not check_name(entry.name):
                continue
            info = entry.stat(follow_symlinks=False)
            if not stat.S_ISREG(info.st_mode):
                raise ImportFailure("Rapportmappen innehåller en länk eller annan filtyp.")
            before = FileVersion(info.st_size, info.st_mtime_ns, info.st_ino)
            before.check_ready(limits, now)
            total += before.size
            check_batch_size(len(reports) + 1, total, limits)
            with open(entry.path, "rb") as stream:
                content = stream.read(limits.max_file_bytes + 1)
            info = os.stat(entry.path, follow_symlinks=False)
            after = FileVersion(info.st_size, info.st_mtime_ns, info.st_ino)
            reports.append(decode_report(entry.name, content, before, after))
    if not reports:
        raise ImportFailure("Inga CSV/TXT-rapporter hittades. Kontrollera sökvägen.")
    return sorted(reports, key=lambda report: report.name)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self, req: urllib.request.Request, fp: BinaryIO, code: int, msg: str,
        headers: HTTPMessage, newurl: str,
    ) -> None:
        # An import token must never follow a redirect to another endpoint.
        return None


def import_endpoint(base_url: str, kind: ReportKind) -> str:
    parsed = urlsplit(base_url)
    if (parsed.scheme not in {"http", "https"} or not parsed.hostname
            or parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise ImportFailure("Ange API:ts bas-URL utan inloggningsuppgifter, query eller fragment.")
    return base_url.rstrip("/") + f"/api/import/{kind}-filer"


def send_reports(
    reports: list[ReportFile], *, kind: ReportKind, url: str, token: str,
) -> dict[str, int]:
    if not token.strip() or "\n" in token or "\r" in token:
        raise ImportFailure("Saknar giltig IMPORT_TOKEN.")
    payload = json.dumps(
        {"filer": [{"namn": report.name, "text": report.text} for report in reports]},
        ensure_ascii=False,
    ).encode("utf-8")
    if len(payload) > 16_000_000:
        raise ImportFailure("Den kodade API-förfrågan är för stor.")
    request = urllib.request.Request(
        import_endpoint(url, kind), data=payload, method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    # Connect directly to the explicitly configured API; no ambient proxy or redirects.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(request, timeout=60) as response:
            body = response.read(65_537)
    except urllib.error.HTTPError as exc:
        code = exc.code
        exc.close()
        raise ImportFailure(f"Import-API svarade HTTP {code}. Kontrollera behörighet och underlag.") from None
    except (OSError, urllib.error.URLError, HTTPException, UnicodeError):
        raise ImportFailure(
            "Import-API kunde inte nås eller svaret avbröts. Utfallet kan vara okänt; "
            "samma underlag kan skickas igen."
        ) from None
    if len(body) > 65_536:
        raise ImportFailure("Import-API gav ett för stort svar. Kontrollera utfallet före omkörning.")
    try:
        result: object = json.loads(body)
    except (ValueError, UnicodeError):
        raise ImportFailure("Import-API gav ett ogiltigt svar. Kontrollera utfallet före omkörning.") from None
    if not isinstance(result, dict):
        raise ImportFailure("Import-API gav ett ogiltigt resultat.")
    counts: dict[str, int] = {}
    for key in ("skapade", "uppdaterade", "hoppade_over"):
        value = result.get(key)
        if type(value) is not int or value < 0:
            raise ImportFailure("Import-API:s resultat saknar giltiga räknare.")
        counts[key] = value
    for key in ("filer_importerade", "filer_for_kontroll", "underlag_sparade"):
        if key not in result:
            continue
        value = result[key]
        if type(value) is not int or value < 0:
            raise ImportFailure("Import-API:s resultat saknar giltiga filräknare.")
        counts[key] = value
    return counts


def print_result(result: dict[str, int]) -> None:
    status = "importerad"
    if result.get("filer_for_kontroll"):
        status = "importerad_med_varningar" if result.get("filer_importerade") else "underlag_sparat_for_kontroll"
    print(json.dumps({"status": status, **result}, ensure_ascii=False), flush=True)


def local_main(kind: ReportKind, default_dir: Path) -> None:
    parser = argparse.ArgumentParser(description=f"Importera {kind} via fil-API:t.")
    parser.add_argument("--dir", type=Path, default=default_dir)
    parser.add_argument("--url", default="http://localhost:3000")
    parser.add_argument("--token", default=os.environ.get("IMPORT_TOKEN", ""))
    args = parser.parse_args()
    try:
        # Local files are deliberately supplied by the operator, so no age delay.
        reports = read_local_reports(args.dir, Limits(min_age_seconds=0))
        print_result(send_reports(reports, kind=kind, url=args.url, token=args.token))
    except (ImportFailure, OSError) as exc:
        message = str(exc) if isinstance(exc, ImportFailure) else "Kunde inte läsa rapportmappen."
        print(f"FEL: {message}", file=sys.stderr)
        raise SystemExit(1) from None
