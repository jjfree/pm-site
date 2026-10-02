"""Offline restore. Stop the server first; preserve the current database."""

import argparse
import shutil
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


def restore(source, directory):
    source, directory = Path(source).resolve(), Path(directory).resolve()
    target = directory / "projects.sqlite3"
    if source == target:
        raise ValueError("Source and destination must differ")
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as db:
        if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
            raise ValueError("Backup integrity check failed")
        if db.execute("PRAGMA user_version").fetchone()[0] != 1:
            raise ValueError("Unsupported backup schema")
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        if not {"records", "audits", "batches", "profiles", "reports"} <= tables:
            raise ValueError("Not a compatible project backup")
    directory.mkdir(parents=True, exist_ok=True)
    if target.exists():
        archive = directory / "backups"
        archive.mkdir(exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
        shutil.copy2(target, archive / f"before-restore-{stamp}.sqlite3")
    temporary = directory / "restore-pending.sqlite3"
    shutil.copy2(source, temporary)
    temporary.replace(target)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("backup", type=Path)
    parser.add_argument("--data-dir", type=Path, default=Path(__file__).resolve().parents[1] / "data")
    parser.add_argument("--server-stopped", action="store_true", required=True)
    options = parser.parse_args()
    restore(options.backup, options.data_dir)
    print("Restore complete; previous database retained in local backups.")
