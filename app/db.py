import json
import sqlite3
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

SCHEMA_VERSION = 3


def now():
    return datetime.now(timezone.utc).isoformat()


class Store:
    def __init__(self, directory: Path):
        self.directory = directory
        directory.mkdir(parents=True, exist_ok=True)
        self.path = directory / "projects.sqlite3"
        with self.connect() as db:
            version = db.execute("PRAGMA user_version").fetchone()[0]
            if version > SCHEMA_VERSION:
                raise ValueError("資料庫版本較新，請使用相容的程式版本")
            db.executescript("""
              CREATE TABLE IF NOT EXISTS records (
                id TEXT PRIMARY KEY, kind TEXT NOT NULL, project_id TEXT,
                payload TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
                created TEXT NOT NULL, updated TEXT NOT NULL);
              CREATE INDEX IF NOT EXISTS record_kind ON records(kind, project_id);
              CREATE TABLE IF NOT EXISTS audits (
                id INTEGER PRIMARY KEY, record_id TEXT, action TEXT, at TEXT, before TEXT, after TEXT);
              CREATE TABLE IF NOT EXISTS batches (
                id TEXT PRIMARY KEY, project_id TEXT, kind TEXT, fingerprint TEXT,
                mapping TEXT, record_ids TEXT, at TEXT, UNIQUE(project_id,kind,fingerprint));
              CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY, payload TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS reports (
                id TEXT PRIMARY KEY, payload TEXT NOT NULL, at TEXT NOT NULL);
              CREATE TABLE IF NOT EXISTS issue_counters (
                project_id TEXT PRIMARY KEY, next_value INTEGER NOT NULL);
            """)
            if version < 2:
                self.migrate_eac(db)
            if version < 3:
                self.migrate_issue_numbers(db, backed_up=version < 2)
            db.execute(f"PRAGMA user_version={SCHEMA_VERSION}")

    def migrate_issue_numbers(self, db, backed_up=False):
        projects = self.list("projects", db=db)
        codes = Counter(p.get("code", "").casefold() for p in projects if p.get("code"))
        eligible = [p for p in projects if p.get("code") and codes[p["code"].casefold()] == 1]
        if not backed_up and any(self.list("issues", p["id"], db) for p in eligible):
            archive = self.directory / "backups"
            archive.mkdir(exist_ok=True)
            target = archive / ("backup-before-issue-numbers-" + uuid4().hex + ".sqlite3")
            with sqlite3.connect(target) as backup:
                db.backup(backup)
                if backup.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValueError("事項編號遷移前備份完整性檢查失敗")
        for project in eligible:
            self.number_existing_issues(project["id"], db)

    def allocate_issue_number(self, project_id, db):
        project = self.get("projects", project_id, db)
        code = project.get("code", "") if project else ""
        if not code:
            raise ValueError("請先設定專案編號")
        row = db.execute(
            "SELECT next_value FROM issue_counters WHERE project_id=?", (project_id,)
        ).fetchone()
        sequence = row["next_value"] if row else 1
        db.execute(
            "INSERT INTO issue_counters(project_id,next_value) VALUES(?,?) "
            "ON CONFLICT(project_id) DO UPDATE SET next_value=excluded.next_value",
            (project_id, sequence + 1),
        )
        return f"{code}-{sequence:04d}"

    def number_existing_issues(self, project_id, db):
        for issue in self.list("issues", project_id, db):
            if not issue.get("number"):
                payload = {key: value for key, value in issue.items()
                           if key not in {"id", "version", "created", "updated"}}
                self.write("issues", payload, issue["id"], issue["version"], db)

    def migrate_eac(self, db):
        from .analytics import amount, money, summarize

        projects = self.list("projects", db=db)
        if projects:
            # Preserve a complete pre-migration database, including historical report snapshots.
            archive = self.directory / "backups"
            archive.mkdir(exist_ok=True)
            target = archive / ("backup-before-eac-" + uuid4().hex + ".sqlite3")
            with sqlite3.connect(target) as backup:
                db.backup(backup)
                if backup.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                    raise ValueError("遷移前備份完整性檢查失敗")
        for project in projects:
            payload = json.loads(
                db.execute("SELECT payload FROM records WHERE id=?", (project["id"],)).fetchone()[0]
            )
            if "eac" not in payload:
                actual = summarize(
                    project, self.list("times", project["id"], db), self.list("rates", project["id"], db)
                )["actual_cost"]
                remaining = amount(payload.get("etc"))
                payload["eac"] = (
                    money(amount(actual) + remaining)
                    if actual is not None and remaining is not None
                    else None
                )
            payload.pop("etc", None)
            self.write("projects", payload, project["id"], project["version"], db)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def unpack(row):
        return {
            **json.loads(row["payload"]),
            "id": row["id"],
            "version": row["version"],
            "created": row["created"],
            "updated": row["updated"],
        }

    def list(self, kind, project=None, db=None):
        if db is None:
            with self.connect() as conn:
                return self.list(kind, project, conn)
        sql, args = "SELECT * FROM records WHERE kind=?", [kind]
        if project:
            sql += " AND project_id=?"
            args.append(project)
        return [self.unpack(r) for r in db.execute(sql + " ORDER BY created,id", args)]

    def get(self, kind, ident, db=None):
        if db is None:
            with self.connect() as conn:
                return self.get(kind, ident, conn)
        row = db.execute("SELECT * FROM records WHERE kind=? AND id=?", (kind, ident)).fetchone()
        return self.unpack(row) if row else None

    def write(self, kind, payload, ident=None, expected=None, db=None):
        if db is None:
            with self.connect() as conn:
                return self.write(kind, payload, ident, expected, conn)
        old = self.get(kind, ident, db) if ident else None
        if ident and old is None:
            raise KeyError(ident)
        if old and expected != old["version"]:
            raise ValueError("資料已更新，請重新整理後再編輯")
        payload = dict(payload)
        if kind == "issues":
            payload["number"] = old.get("number") if old and old.get("number") else self.allocate_issue_number(
                payload["project_id"], db
            )
        ident = ident or uuid4().hex
        stamp, body = now(), json.dumps(payload, ensure_ascii=False)
        version = old["version"] + 1 if old else 1
        db.execute(
            """INSERT INTO records VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                   payload=excluded.payload,version=excluded.version,updated=excluded.updated""",
            (ident, kind, payload.get("project_id"), body, version, old["created"] if old else stamp, stamp),
        )
        db.execute(
            "INSERT INTO audits(record_id,action,at,before,after) VALUES(?,?,?,?,?)",
            (
                ident,
                "update" if old else "create",
                stamp,
                json.dumps(old, ensure_ascii=False) if old else None,
                body,
            ),
        )
        return self.get(kind, ident, db)

    def delete(self, kind, ident, expected):
        with self.connect() as db:
            old = self.get(kind, ident, db)
            if not old:
                raise KeyError(ident)
            if old["version"] != expected:
                raise ValueError("資料已更新，請重新整理")
            if (
                kind == "projects"
                and db.execute("SELECT 1 FROM records WHERE project_id=? LIMIT 1", (ident,)).fetchone()
            ):
                raise ValueError("專案仍有關聯資料，請先處理相關紀錄")
            db.execute("DELETE FROM records WHERE id=?", (ident,))
            db.execute(
                "INSERT INTO audits(record_id,action,at,before) VALUES(?,?,?,?)",
                (ident, "delete", now(), json.dumps(old, ensure_ascii=False)),
            )

    def backup(self):
        target = self.directory / "backups" / ("backup-" + uuid4().hex + ".sqlite3")
        target.parent.mkdir(exist_ok=True)
        with self.connect() as source, sqlite3.connect(target) as destination:
            source.backup(destination)
            if destination.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise ValueError("備份完整性檢查失敗")
        return target
