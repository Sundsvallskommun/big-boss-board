"""One bounded SMB import, invoked by an OpenShift CronJob (never by API startup)."""

from __future__ import annotations

import argparse
import json
import ntpath
import os
import stat
import sys
import time
from contextlib import closing
from dataclasses import dataclass, field

from app.report_import import (
    FileVersion, ImportFailure, Limits, ReportFile, ReportKind, check_batch_size,
    check_name, decode_report, import_endpoint, print_result, send_reports,
)


@dataclass(frozen=True)
class SMBSource:
    directory: str
    username: str = field(repr=False)
    password: str = field(repr=False)

    def __post_init__(self) -> None:
        parts = self.directory.split("\\")
        if (not self.directory.startswith("\\\\") or len(parts) < 5
                or any(not part or part in {".", ".."} for part in parts[2:])
                or any(c in self.directory for c in "/\r\n\x00")):
            raise ImportFailure("SMB_DIRECTORY måste vara en UNC-sökväg till en bestämd undermapp.")
        if (not self.username.strip() or not self.password
                or self.username.startswith("REPLACE_") or self.password.startswith("REPLACE_")):
            raise ImportFailure("SMB_USERNAME och SMB_PASSWORD måste anges.")

    @property
    def server(self) -> str:
        return self.directory.split("\\")[2]


def read_smb_reports(source: SMBSource, limits: Limits) -> list[ReportFile]:
    import smbclient
    from smbprotocol.exceptions import SMBException
    from spnego.exceptions import SpnegoError

    reports: list[ReportFile] = []
    total = 0
    now = time.time()
    stage = "anslutning"
    try:
        # NTLM with mandatory signing and SMB3 encryption. No implicit Kerberos fallback.
        # Kerberos-only environments require a separately configured runtime before activation.
        smbclient.register_session(
            source.server, username=source.username, password=source.password,
            auth_protocol="ntlm", encrypt=True, require_signing=True, connection_timeout=15,
        )
        stage = "filläsning"
        with closing(smbclient.scandir(source.directory)) as entries:
            for index, entry in enumerate(entries):
                if index >= 1000:
                    raise ImportFailure("Mappen har för många poster. Använd en avgränsad rapportmapp.")
                if not check_name(entry.name):
                    continue
                path = ntpath.join(source.directory, entry.name)
                info = smbclient.stat(path, follow_symlinks=False)
                if not stat.S_ISREG(info.st_mode):
                    raise ImportFailure("Rapportmappen innehåller en länk eller annan filtyp.")
                before = FileVersion(info.st_size, info.st_mtime_ns, info.st_ino)
                before.check_ready(limits, now)
                total += before.size
                check_batch_size(len(reports) + 1, total, limits)
                # Deny concurrent writers/deletion while reading; never modify source files.
                with smbclient.open_file(path, mode="rb", share_access="r") as stream:
                    content = stream.read(limits.max_file_bytes + 1)
                    info = smbclient.stat(path, follow_symlinks=False)
                after = FileVersion(info.st_size, info.st_mtime_ns, info.st_ino)
                reports.append(decode_report(entry.name, content, before, after))
    except (OSError, SMBException, SpnegoError, ValueError):
        raise ImportFailure(
            f"SMB-{stage} misslyckades. Kontrollera nät, konto, sökväg och färdigskrivna filer."
        ) from None
    finally:
        try:
            smbclient.reset_connection_cache()
        except (OSError, SMBException):
            raise ImportFailure("SMB-anslutningen kunde inte stängas normalt.") from None
    if not reports:
        raise ImportFailure("Inga CSV/TXT-rapporter hittades. Kontrollera sökvägen.")
    return sorted(reports, key=lambda report: report.name)


def main() -> None:
    parser = argparse.ArgumentParser(description="Hämta rapporter från SMB och importera via API.")
    parser.add_argument("--kind", required=True, choices=("ekonomi", "sjukfranvaro"))
    parser.add_argument("--dry-run", action="store_true", help="Läs filer utan att anropa import-API:t.")
    args = parser.parse_args()
    try:
        kind: ReportKind = args.kind
        limits = Limits(
            max_files=int(os.environ.get("IMPORT_MAX_FILES", "100")),
            max_file_bytes=int(os.environ.get("IMPORT_MAX_FILE_BYTES", "2000000")),
            max_total_bytes=int(os.environ.get("IMPORT_MAX_TOTAL_BYTES", "8000000")),
            min_age_seconds=int(os.environ.get("IMPORT_MIN_AGE_SECONDS", "300")),
        )
        source = SMBSource(
            directory=os.environ.get("SMB_DIRECTORY", ""),
            username=os.environ.get("SMB_USERNAME", ""),
            password=os.environ.get("SMB_PASSWORD", ""),
        )
        url = os.environ.get("IMPORT_API_URL", "")
        token = os.environ.get("IMPORT_TOKEN", "")
        if not args.dry_run:
            import_endpoint(url, kind)
            if not token.strip():
                raise ImportFailure("Saknar IMPORT_TOKEN.")
        reports = read_smb_reports(source, limits)
        print(json.dumps({
            "status": "hämtad", "typ": kind, "filer": len(reports),
            "byte": sum(len(report.text.encode("utf-8")) for report in reports),
        }, ensure_ascii=False), flush=True)
        if args.dry_run:
            print('{"status": "provhämtning_klar", "api_anropat": false}', flush=True)
        else:
            result = send_reports(reports, kind=kind, url=url, token=token)
            print_result(result)
            if result["hoppade_over"]:
                raise ImportFailure(
                    "Importen är delvis genomförd men enheter hoppades över. "
                    "Kontrollera organisationskoppling och underlag före omkörning."
                )
            if result["skapade"] + result["uppdaterade"] == 0:
                raise ImportFailure("API-anropet lyckades men inga mätvärden importerades.")
    except ImportFailure as exc:
        print(json.dumps({"status": "misslyckad", "fel": str(exc)}, ensure_ascii=False), file=sys.stderr)
        raise SystemExit(1) from None
    except ValueError:
        print('{"status": "misslyckad", "fel": "Ogiltig numerisk konfiguration."}', file=sys.stderr)
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
