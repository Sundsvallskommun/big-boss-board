"""File/HTTP boundaries without a live SMB server, API or production data."""

from __future__ import annotations

import io
import json
import ntpath
import os
import sys
import time
import urllib.request
import urllib.response
from email.message import Message
from pathlib import Path
from unicodedata import normalize

import pytest
import smbclient

from app.report_import import (
    FileVersion, ImportFailure, Limits, ReportFile, decode_report, local_main,
    read_local_reports, send_reports,
)
from app.smb_import import SMBSource, main, read_smb_reports


def report_file(directory: Path, name: str = "RR_2026-05-09.csv", text: str = "Period,Enhet\n2026-04-30,23"):
    path = directory / name
    path.write_text(text, encoding="utf-8")
    timestamp = time.time() - 600
    os.utime(path, (timestamp, timestamp))
    return path


def test_original_names_and_utf8_are_preserved(tmp_path):
    report_file(tmp_path, text="\ufeffPeriod,Mätvärde\r\n2026-04-30,42")
    report_file(tmp_path, "PERSONAL.TXT", "År\tVärde\n2026\t42")
    report_file(tmp_path, "incomplete.csv.tmp")
    report_file(tmp_path, ".hidden.csv")
    reports = read_local_reports(tmp_path, Limits())
    assert [r.name for r in reports] == ["PERSONAL.TXT", "RR_2026-05-09.csv"]
    assert reports[1].text == "Period,Mätvärde\r\n2026-04-30,42"


@pytest.mark.parametrize("case", ["empty", "young", "large", "count", "total", "encoding", "link"])
def test_invalid_batch_is_rejected_whole(tmp_path, case):
    limits = Limits(max_file_bytes=40, max_total_bytes=60)
    path = report_file(tmp_path)
    if case == "empty":
        path.write_bytes(b"")
    elif case == "young":
        os.utime(path, None)
    elif case == "large":
        report_file(tmp_path, text="x" * 41)
    elif case == "count":
        report_file(tmp_path, "second.csv")
        limits = Limits(max_files=1)
    elif case == "total":
        report_file(tmp_path, text="x" * 40)
        report_file(tmp_path, "second.csv", "x" * 40)
    elif case == "encoding":
        path.write_bytes(b"\xff")
        limits = Limits(min_age_seconds=0)
    else:
        (tmp_path / "linked.csv").symlink_to(path)
    with pytest.raises(ImportFailure):
        read_local_reports(tmp_path, limits)


def test_empty_directory_fails_instead_of_reporting_success(tmp_path):
    with pytest.raises(ImportFailure, match="Inga CSV"):
        read_local_reports(tmp_path, Limits())


@pytest.mark.parametrize("before,after,content", [
    (FileVersion(3, 1, 1), FileVersion(3, 2, 1), b"abc"),
    (FileVersion(3, 1, 1), FileVersion(3, 1, 2), b"abc"),
    (FileVersion(3, 1, 1), FileVersion(3, 1, 1), b"ab"),
])
def test_changed_or_truncated_download_is_rejected(before, after, content):
    with pytest.raises(ImportFailure, match="ändrades"):
        decode_report("report.csv", content, before, after)


class HTTPBoundary(urllib.request.HTTPHandler):
    """In-memory HTTP transport; real urllib request/error/redirect handling."""

    def __init__(self):
        super().__init__()
        self.requests: list[urllib.request.Request] = []
        self.status = 200
        self.body = b'{"skapade": 0, "uppdaterade": 1, "hoppade_over": 0}'

    def http_open(self, request):
        self.requests.append(request)
        headers = Message()
        if self.status == 302:
            headers["Location"] = "http://other.example/collect"
        response = urllib.response.addinfourl(io.BytesIO(self.body), headers, request.full_url, self.status)
        response.msg = "Test response"
        return response


@pytest.fixture
def http_boundary(monkeypatch):
    boundary = HTTPBoundary()
    build_opener = urllib.request.build_opener
    monkeypatch.setattr(urllib.request, "build_opener", lambda *handlers: build_opener(*handlers, boundary))
    return boundary


@pytest.mark.parametrize("kind", ["ekonomi", "sjukfranvaro"])
def test_named_files_reach_correct_import_contract_and_can_be_retried(http_boundary, kind):
    reports = [ReportFile("Rapport_2026-05-09.csv", "Period,Enhet\n2026-04-30,23")]
    for _ in range(2):
        result = send_reports(reports, kind=kind, url="http://api.example", token="test-token")
        assert result == {"skapade": 0, "uppdaterade": 1, "hoppade_over": 0}
    assert len(http_boundary.requests) == 2
    first, second = http_boundary.requests
    assert first.full_url == f"http://api.example/api/import/{kind}-filer"
    assert first.get_header("Authorization") == "Bearer test-token"
    assert first.data == second.data
    assert json.loads(first.data) == {"filer": [{"namn": reports[0].name, "text": reports[0].text}]}


@pytest.mark.parametrize("status", [302, 401, 422, 503])
def test_error_response_is_redacted_and_redirect_never_gets_token(http_boundary, status):
    http_boundary.status = status
    http_boundary.body = b"private report body and credentials"
    with pytest.raises(ImportFailure, match=f"HTTP {status}") as error:
        send_reports([ReportFile("r.csv", "data")], kind="ekonomi", url="http://api.example", token="test-token")
    assert "private" not in str(error.value)
    assert len(http_boundary.requests) == 1


@pytest.mark.parametrize("body", [b"invalid secret", b"x" * 65_537, b'[]', b'{"skapade": true}'])
def test_unusable_response_is_a_failure_without_raw_output(http_boundary, body):
    http_boundary.body = body
    with pytest.raises(ImportFailure) as error:
        send_reports([ReportFile("r.csv", "data")], kind="ekonomi", url="http://api.example", token="test-token")
    assert "invalid secret" not in str(error.value)


def test_local_cli_uses_transport_without_backend_settings(tmp_path, monkeypatch, http_boundary, capsys):
    report_file(tmp_path)
    monkeypatch.setattr(sys, "argv", ["import", "--url", "http://api.example", "--token", "test-token"])
    local_main("ekonomi", tmp_path)
    assert json.loads(capsys.readouterr().out)["uppdaterade"] == 1
    assert len(http_boundary.requests) == 1


@pytest.fixture
def smb_directory(tmp_path, monkeypatch):
    """Replace only SMB I/O with a local filesystem; exercise the actual reader."""
    monkeypatch.setattr(smbclient, "register_session", lambda *args, **kwargs: None)
    monkeypatch.setattr(smbclient, "reset_connection_cache", lambda: None)
    monkeypatch.setattr(smbclient, "scandir", lambda path: os.scandir(tmp_path))
    monkeypatch.setattr(smbclient, "stat", lambda path, **kwargs: os.stat(tmp_path / ntpath.basename(path), **kwargs))

    def open_file(path, *, mode, share_access):
        assert mode == "rb" and share_access == "r"
        return open(tmp_path / ntpath.basename(path), mode)

    monkeypatch.setattr(smbclient, "open_file", open_file)
    return tmp_path


@pytest.mark.parametrize("directory", [r"\\saas066\Kommun", r"\\server\share\reports"])
def test_smb_reader_matches_local_transport(smb_directory, directory):
    report_file(smb_directory, "kpidata_RR_förvaltning_2026-09-07.csv")
    source = SMBSource(directory, "test-account", "test-password")
    assert read_smb_reports(source, Limits(), kind="ekonomi") == read_local_reports(smb_directory, Limits())
    assert "test-password" not in repr(source)


def test_smb_read_failure_discards_batch_and_redacts_detail(smb_directory, monkeypatch):
    report_file(smb_directory, "kpidata_RR_förvaltning_2026-09-07.csv")

    def fail(*args, **kwargs):
        raise OSError("private path and credentials")

    monkeypatch.setattr(smbclient, "open_file", fail)
    with pytest.raises(ImportFailure, match="SMB-filläsning") as error:
        read_smb_reports(SMBSource(r"\\server\share\reports", "test", "secret"), Limits(), kind="ekonomi")
    assert "private" not in str(error.value)


def test_smb_dry_run_never_calls_api(smb_directory, monkeypatch, http_boundary, capsys):
    report_file(smb_directory, "kpidata_RR_förvaltning_2026-09-07.csv")
    monkeypatch.setenv("SMB_DIRECTORY", r"\\saas066\Kommun")
    monkeypatch.setenv("SMB_USERNAME", "test")
    monkeypatch.setenv("SMB_PASSWORD", "secret")
    monkeypatch.delenv("IMPORT_API_URL", raising=False)
    monkeypatch.setattr(sys, "argv", ["smb-import", "--kind", "ekonomi", "--dry-run"])
    main()
    assert not http_boundary.requests
    output = capsys.readouterr().out
    assert '"api_anropat": false' in output
    assert "secret" not in output


@pytest.mark.parametrize("counts", [
    {"skapade": 0, "uppdaterade": 1, "hoppade_over": 0},
    {"skapade": 0, "uppdaterade": 1, "hoppade_over": 1},
    {"skapade": 0, "uppdaterade": 0, "hoppade_over": 0},
])
def test_job_imports_once_and_flags_skipped_or_unmapped_data(
    smb_directory, monkeypatch, http_boundary, capsys, counts,
):
    report_file(smb_directory, "kpidata_Personal_förvaltning_2026-09-14.csv")
    monkeypatch.setenv("SMB_DIRECTORY", r"\\server\share\reports")
    monkeypatch.setenv("SMB_USERNAME", "test")
    monkeypatch.setenv("SMB_PASSWORD", "secret")
    monkeypatch.setenv("IMPORT_TOKEN", "test-token")
    monkeypatch.setenv("IMPORT_API_URL", "http://api.example")
    monkeypatch.setattr(sys, "argv", ["smb-import", "--kind", "sjukfranvaro"])
    http_boundary.body = json.dumps(counts).encode()
    if counts["hoppade_over"] or not counts["uppdaterade"]:
        with pytest.raises(SystemExit) as error:
            main()
        assert error.value.code == 1
        assert '"status": "misslyckad"' in capsys.readouterr().err
    else:
        main()
        assert '"status": "importerad"' in capsys.readouterr().out
    assert len(http_boundary.requests) == 1
    assert json.loads(http_boundary.requests[0].data)["filer"][0]["namn"] == (
        "kpidata_Personal_förvaltning_2026-09-14.csv"
    )


def test_smb_authentication_error_is_safe_and_does_not_read_files(monkeypatch):
    from smbprotocol.exceptions import SMBAuthenticationError

    def refuse(*args, **kwargs):
        raise SMBAuthenticationError("private account and credential")

    monkeypatch.setattr(smbclient, "register_session", refuse)
    with pytest.raises(ImportFailure, match="SMB-anslutning") as error:
        read_smb_reports(SMBSource(r"\\server\share\reports", "test", "secret"), Limits(), kind="ekonomi")
    assert "private" not in str(error.value)


@pytest.mark.parametrize("kind,prefix", [
    ("ekonomi", "kpidata_RR_förvaltning"),
    ("sjukfranvaro", "kpidata_Personal_förvaltning"),
])
def test_smb_selects_only_requested_report_type_from_mixed_folder(smb_directory, kind, prefix):
    expected = []
    for report_prefix in ("kpidata_RR_förvaltning", "kpidata_Personal_förvaltning"):
        for day in ("2026-09-07", "2026-09-14"):
            name = f"{report_prefix}_{day}.csv"
            report_file(smb_directory, name)
            if report_prefix == prefix:
                expected.append(name)
    for name in (
        "other.csv", "kpidata_RR_enhet_2026-09-07.csv",
        "kpidata_Personal_enhet_2026-09-14.csv", f"{prefix}_2026-09-14.csv.tmp",
        f"{prefix}_2026-09-14_backup.csv", f"{prefix}_latest.csv",
    ):
        report_file(smb_directory, name)
    nested = smb_directory / "archive"
    nested.mkdir()
    report_file(nested, f"{prefix}_2026-08-14.csv")
    reports = read_smb_reports(
        SMBSource(r"\\saas066\Kommun", "test", "secret"),
        Limits(max_files=2), kind=kind,
    )
    assert [report.name for report in reports] == expected


@pytest.mark.parametrize("kind,prefix", [
    ("ekonomi", "kpidata_RR_förvaltning"),
    ("sjukfranvaro", "kpidata_Personal_förvaltning"),
])
@pytest.mark.parametrize("form", ["NFC", "NFD"])
def test_smb_preserves_original_filename_across_unicode_forms(smb_directory, kind, prefix, form):
    name = normalize(form, f"{prefix}_2026-09-14.CSV")
    path = report_file(smb_directory, name)
    reports = read_smb_reports(
        SMBSource(r"\\server\share\reports", "test", "secret"), Limits(), kind=kind,
    )
    # Filesystems may themselves normalize Unicode; preserve the directory entry's form.
    with os.scandir(smb_directory) as entries:
        original_name = next(entries).name
    assert reports == [ReportFile(original_name, path.read_text())]


def test_smb_fails_when_only_other_report_type_is_present(smb_directory):
    report_file(smb_directory, "kpidata_RR_förvaltning_2026-09-07.csv")
    with pytest.raises(ImportFailure, match="Inga rapportfiler för sjukfranvaro"):
        read_smb_reports(
            SMBSource(r"\\server\share\reports", "test", "secret"), Limits(), kind="sjukfranvaro",
        )


@pytest.mark.parametrize("directory", [
    "", r"\\server", r"\\server\\share", r"\\server\share\..\other",
    r"\\server\share\.\other", "/local/path", "\\\\server\\share\\", "\\\\server\\share\n",
])
def test_smb_requires_explicit_share_without_empty_or_relative_components(directory):
    with pytest.raises(ImportFailure):
        SMBSource(directory, "test", "secret")
