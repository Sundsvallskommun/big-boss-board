#!/usr/bin/env python3
"""Importera ekonomi via samma filtransport som det schemalagda jobbet.

IMPORT_TOKEN=… python3 scripts/import_ekonomi_serie.py --dir /rapportmapp --url https://app.example
Endast standardbiblioteket behövs för lokal filimport.
"""

from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from app.report_import import local_main  # noqa: E402


if __name__ == "__main__":
    local_main("ekonomi", ROOT / "ekonomi-indata")
