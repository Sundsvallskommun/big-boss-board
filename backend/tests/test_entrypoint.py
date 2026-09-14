"""Kör startskriptet med små ersättningsprogram; ingen server eller databas startas."""

import os
from pathlib import Path
import subprocess

import pytest


@pytest.mark.parametrize("migration_exit", [0, 1])
def test_startup_only_migrates_and_stops_if_migration_fails(tmp_path, migration_exit):
    log = tmp_path / "commands.log"
    for command, exit_code in [("alembic", migration_exit), ("gunicorn", 0), ("python", 99)]:
        binary = tmp_path / command
        binary.write_text(
            f'#!/bin/sh\nprintf "%s\\n" "{command} $*" >> "$COMMAND_LOG"\n'
            f"exit {exit_code}\n",
            encoding="utf-8",
        )
        binary.chmod(0o700)
    entrypoint = Path(__file__).resolve().parents[1] / "entrypoint.sh"
    result = subprocess.run(
        ["/bin/sh", str(entrypoint)], cwd=tmp_path,
        env={**os.environ, "PATH": str(tmp_path), "COMMAND_LOG": str(log),
             "PORT": "3000", "WEB_CONCURRENCY": "1"},
        capture_output=True, text=True, timeout=5,
    )
    commands = log.read_text().splitlines()
    assert commands[0] == "alembic upgrade head"
    assert result.returncode == migration_exit
    if migration_exit:
        assert len(commands) == 1
    else:
        assert len(commands) == 2
        assert commands[1].startswith("gunicorn app.main:app ")
        assert "--bind 0.0.0.0:3000" in commands[1]
