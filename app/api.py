import hashlib
import hmac
import json
import os
import secrets
import time
from datetime import date
from pathlib import Path
from uuid import uuid4
from urllib.parse import urlparse

from fastapi import FastAPI, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from .analytics import evaluate_scenario, summarize
from .db import Store, now
from .imports import MAX_BYTES, prepare, read_tables, sanitize_headers, suggested_mapping
from .models import MODELS, Settings
from .reports import export_table, make_pptx, make_snapshot
from .runtime import instance_id, revision_id

ROOT = Path(__file__).resolve().parent.parent


def create_app(directory=None):
    store = Store(Path(directory or os.getenv("PM_DATA_DIR", ROOT / "data")))
    app = FastAPI(title="PM Site", docs_url=None, redoc_url=None, openapi_url=None)
    app.state.store = store
    revision = revision_id()
    csrf, sessions, previews = secrets.token_urlsafe(32), set(), {}

    def read_settings():
        with store.connect() as db:
            row = db.execute("SELECT payload FROM profiles WHERE id='local-settings'").fetchone()
        data = json.loads(row["payload"]) if row else {}
        for rate in data.get("sale_rates", []):
            rate.pop("tax_basis", None)
        return Settings.model_validate(data).model_dump(mode="json")

    @app.middleware("http")
    async def local_security(request: Request, call_next):
        host = request.headers.get("host", "").split(":")[0]
        if host not in {"127.0.0.1", "localhost", "testserver"}:
            return JSONResponse({"detail": "僅接受本機Host"}, status_code=403)
        if request.headers.get("sec-fetch-site") == "cross-site":
            return JSONResponse({"detail": "拒絕跨站請求"}, status_code=403)
        if request.url.path.startswith("/api/") and request.url.path not in {"/api/health", "/api/bootstrap"}:
            if request.cookies.get("pm_session") not in sessions:
                return JSONResponse({"detail": "請重新載入本機介面"}, status_code=401)
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            origin = request.headers.get("origin")
            allowed = {f"http://{request.headers.get('host')}"}
            if os.getenv("PM_DEV_ORIGIN"):
                allowed.add(os.environ["PM_DEV_ORIGIN"])
            if origin and origin not in allowed:
                return JSONResponse({"detail": "來源不符"}, status_code=403)
            if not hmac.compare_digest(request.headers.get("x-csrf-token", ""), csrf):
                return JSONResponse({"detail": "請求驗證失敗"}, status_code=403)
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; "
            "frame-ancestors 'none'; object-src 'none'; base-uri 'self'"
        )
        if request.url.path.startswith("/api/") or request.url.path in {"/", "/index.html"}:
            response.headers["Cache-Control"] = "no-store"
        return response

    def check_kind(kind):
        if kind not in MODELS:
            raise HTTPException(404, "資料類型不存在")

    def validate(kind, payload, ident=None, db=None):
        check_kind(kind)
        if kind == "rates":
            payload = {key: value for key, value in payload.items() if key != "tax_basis"}
        try:
            data = MODELS[kind].model_validate(payload).model_dump(mode="json")
        except ValidationError as exc:
            fields = ", ".join(str(e["loc"][0]) if e["loc"] else "日期範圍" for e in exc.errors())
            raise HTTPException(422, "請檢查必填值、型別與數值範圍：" + fields) from exc
        if kind != "projects" and not store.get("projects", data["project_id"], db):
            raise HTTPException(422, "專案不存在")
        if kind == "issues" and data["external_url"]:
            if urlparse(data["external_url"]).scheme not in {"http", "https"}:
                raise HTTPException(422, "外部連結僅支援HTTP／HTTPS")
        if kind == "rates":
            for r in store.list("rates", data["project_id"], db):
                if r["id"] == ident or any(r[k] != data[k] for k in ["role", "person", "purpose"]):
                    continue
                if r["start"] <= (data["end"] or "9999-12-31") and data["start"] <= (
                    r["end"] or "9999-12-31"
                ):
                    raise HTTPException(409, "同一角色／人員／用途的單價有效期間重疊")
        if kind in {"roles", "members"}:
            key = "name" if kind == "roles" else "person"
            if any(
                row["id"] != ident and row[key].casefold() == data[key].casefold()
                for row in store.list(kind, data["project_id"], db)
            ):
                raise HTTPException(409, "此專案已有相同的角色或成員")
        return data

    def project_bundle(ident, start=None, end=None):
        project = store.get("projects", ident)
        if not project:
            raise HTTPException(404, "專案不存在")
        rates = store.list("rates", ident)
        summary = summarize(project, store.list("times", ident), rates, start, end)
        scenarios = [evaluate_scenario(project, s, rates, summary) for s in store.list("scenarios", ident)]
        return project, summary, scenarios

    @app.get("/api/health")
    def health():
        return {
            "status": "ok",
            "version": "0.1.0",
            "application": "pm-site",
            "instance": instance_id(store.directory),
            "revision": revision,
            "pid": os.getpid(),
        }

    @app.get("/api/bootstrap")
    def bootstrap():
        session = secrets.token_urlsafe(32)
        sessions.add(session)
        if len(sessions) > 256:
            sessions.clear()
            sessions.add(session)
        response = JSONResponse({"csrf": csrf, "version": "0.1.0"})
        response.set_cookie("pm_session", session, httponly=True, samesite="strict")
        return response

    @app.get("/api/overview")
    def overview():
        result = []
        today = date.today().isoformat()
        for p in store.list("projects"):
            _, summary, _ = project_bundle(p["id"])
            issues = store.list("issues", p["id"])
            works = store.list("works", p["id"])
            pending = [w for w in works if w["status"] != "done"]
            milestones = sorted(
                [w for w in pending if w["kind"] == "milestone" and w["due"]], key=lambda w: w["due"]
            )
            result.append(
                {
                    **p,
                    "metrics": summary,
                    "open_issues": sum(i["status"] not in {"resolved", "closed"} for i in issues),
                    "overdue": sum(bool(w["due"] and w["due"] < today) for w in pending),
                    "next_milestone": milestones[0] if milestones else None,
                }
            )
        return result

    @app.get("/api/analytics/{project_id}")
    def analytics(project_id: str, start: date | None = None, end: date | None = None):
        if start and end and start > end:
            raise HTTPException(422, "日期範圍錯誤")
        p, summary, scenarios = project_bundle(
            project_id, str(start) if start else None, str(end) if end else None
        )
        return {"project": p, "summary": summary, "scenarios": scenarios}

    @app.get("/api/records/{kind}")
    def records(kind: str, project_id: str | None = None):
        check_kind(kind)
        rows = store.list(kind, project_id)
        return [{key: value for key, value in row.items() if key != "tax_basis"} for row in rows] if kind == "rates" else rows

    @app.post("/api/times/bulk-role")
    def bulk_time_role(payload: dict):
        project_id, person, role = payload.get("project_id"), payload.get("person"), payload.get("role")
        expected = payload.get("entries")
        if not all(isinstance(value, str) and value for value in (project_id, person, role)) or len(role) > 100:
            raise HTTPException(422, "請選擇成員與預設角色")
        if not isinstance(expected, list) or len(expected) > 20000 or any(
            not isinstance(item, dict) or not isinstance(item.get("id"), str) or not isinstance(item.get("version"), int)
            for item in expected
        ):
            raise HTTPException(422, "工時清單格式錯誤")
        versions = {item["id"]: item["version"] for item in expected}
        if len(versions) != len(expected):
            raise HTTPException(422, "工時清單含重複紀錄")
        with store.connect() as db:
            if not any(
                member["person"] == person and member["role"] == role and member["active"]
                for member in store.list("members", project_id, db)
            ):
                raise HTTPException(422, "成員或預設角色已變更，請重新整理")
            affected = [
                entry for entry in store.list("times", project_id, db)
                if entry["person"] == person and entry["role"] != role
            ]
            if {entry["id"] for entry in affected} != set(versions) or any(
                entry["version"] != versions[entry["id"]] for entry in affected
            ):
                raise HTTPException(409, "工時清單已變更，請重新整理並再次確認")
            for entry in affected:
                data = {key: value for key, value in entry.items() if key not in {"id", "version", "created", "updated"}}
                data["role"] = role
                store.write("times", data, entry["id"], entry["version"], db)
            return {"updated": len(affected)}

    @app.post("/api/records/{kind}")
    def create_record(kind: str, payload: dict):
        with store.connect() as db:
            defaults = read_settings()["sale_rates"] if kind == "projects" else []
            saved = store.write(kind, validate(kind, payload, db=db), db=db)
            if kind == "projects":
                for default in defaults:
                    rate = {**default, "project_id": saved["id"], "purpose": "sale", "unit": "day"}
                    store.write("rates", validate("rates", rate, db=db), db=db)
            return saved

    @app.get("/api/settings")
    def settings():
        return read_settings()

    @app.put("/api/settings")
    def update_settings(payload: dict):
        try:
            if isinstance(payload.get("sale_rates"), list):
                payload = {
                    **payload,
                    "sale_rates": [
                        {key: value for key, value in rate.items() if key != "tax_basis"}
                        if isinstance(rate, dict) else rate
                        for rate in payload["sale_rates"]
                    ],
                }
            settings = Settings.model_validate(payload).model_dump(mode="json")
        except ValidationError as exc:
            raise HTTPException(422, "請檢查角色、金額或重複角色") from exc
        with store.connect() as db:
            db.execute(
                "INSERT OR REPLACE INTO profiles VALUES('local-settings',?)",
                (json.dumps(settings, ensure_ascii=False),),
            )
        return settings

    @app.put("/api/records/{kind}/{ident}")
    def update_record(kind: str, ident: str, payload: dict):
        version = payload.pop("version", None)
        if payload.pop("apply_role_to_person", False):
            raise HTTPException(422, "請使用成員頁的「更正既有工時」功能，或逐筆修改歷史工時")
        with store.connect() as db:
            try:
                data = validate(kind, payload, ident, db)
                old = store.get(kind, ident, db)
                if old and kind != "projects" and old["project_id"] != data["project_id"]:
                    raise HTTPException(422, "不可透過編輯移動資料至另一專案")
                if old and kind in {"roles", "members"}:
                    key = "name" if kind == "roles" else "person"
                    if old[key] != data[key]:
                        raise HTTPException(422, "已建檔的角色或成員不可更名；請新增資料並停用舊項目")
                saved = store.write(kind, data, ident, version, db)
                return saved
            except KeyError as exc:
                raise HTTPException(404, "紀錄不存在") from exc
            except ValueError as exc:
                raise HTTPException(409, str(exc)) from exc

    @app.delete("/api/records/{kind}/{ident}")
    def delete_record(kind: str, ident: str, version: int):
        check_kind(kind)
        try:
            if kind in {"roles", "members"}:
                record = store.get(kind, ident)
                if record:
                    key = "role" if kind == "roles" else "person"
                    value = record["name"] if kind == "roles" else record["person"]
                    related = ("rates", "times", "members") if kind == "roles" else ("rates", "times")
                    if any(
                        row.get(key) == value
                        for related_kind in related
                        for row in store.list(related_kind, record["project_id"])
                        if row["id"] != ident
                    ):
                        raise HTTPException(409, "已有工時、單價或成員使用此項目；請改為停用")
            store.delete(kind, ident, version)
            return {"deleted": True}
        except KeyError as exc:
            raise HTTPException(404, "紀錄不存在") from exc
        except ValueError as exc:
            raise HTTPException(409, str(exc)) from exc

    @app.post("/api/import/inspect")
    async def inspect_file(file: UploadFile = File(...)):
        content = await file.read(MAX_BYTES + 1)
        try:
            tables = read_tables(file.filename or "", content)
        except (ValueError, UnicodeError) as exc:
            raise HTTPException(422, str(exc)) from exc
        # Keep uploads only in short-lived process memory, never under a public source tree.
        for key in list(previews):
            if time.monotonic() - previews[key]["created"] > 1800:
                del previews[key]
        if len(previews) >= 8:
            raise HTTPException(429, "暫存匯入已滿，請稍後或重啟服務")
        ident = uuid4().hex
        previews[ident] = {
            "tables": tables,
            "created": time.monotonic(),
            "hash": hashlib.sha256(content).hexdigest(),
        }
        return {
            "id": ident,
            "sheets": [
                {"name": name, "rows": len(rows) - 1, "headers": sanitize_headers(rows[0] if rows else [])}
                for name, rows in tables.items()
            ],
        }

    def prepared(payload):
        source = previews.get(payload.get("upload_id"))
        if not source or time.monotonic() - source["created"] > 1800:
            raise HTTPException(410, "匯入暫存已過期，請重新選檔")
        kind, sheet = payload.get("kind"), payload.get("sheet")
        check_kind(kind)
        if sheet not in source["tables"]:
            raise HTTPException(422, "工作表不存在")
        if not store.get("projects", payload.get("project_id")):
            raise HTTPException(422, "請選有效專案")
        rows = source["tables"][sheet]
        mapping = payload.get("mapping")
        if mapping is None:
            mapping = suggested_mapping(kind, rows[0] if rows else [])
        try:
            result = prepare(kind, payload["project_id"], rows, mapping, payload.get("marker_map"))
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        fingerprint = hashlib.sha256(
            json.dumps(
                [source["hash"], sheet, kind, mapping, payload.get("marker_map")], sort_keys=True
            ).encode()
        ).hexdigest()
        return result, mapping, fingerprint

    @app.post("/api/import/preview")
    def preview_import(payload: dict):
        result, mapping, fingerprint = prepared(payload)
        with store.connect() as db:
            existing = db.execute(
                "SELECT id FROM batches WHERE project_id=? AND kind=? AND fingerprint=?",
                (payload["project_id"], payload["kind"], fingerprint),
            ).fetchone()
        return {**result, "mapping": mapping, "already_imported": bool(existing)}

    @app.post("/api/import/commit")
    def commit_import(payload: dict):
        result, mapping, fingerprint = prepared(payload)
        if result["errors"] and not payload.get("skip_errors", False):
            raise HTTPException(422, "請修正錯誤或明確選擇略過錯誤列")
        skip_rows = set(payload.get("skip_rows", []))
        inserted, skipped, updated, ids = 0, 0, 0, []
        kind, pid = payload["kind"], payload["project_id"]
        with store.connect() as db:
            if db.execute(
                "SELECT 1 FROM batches WHERE project_id=? AND kind=? AND fingerprint=?",
                (pid, kind, fingerprint),
            ).fetchone():
                return {
                    "inserted": 0,
                    "updated": 0,
                    "skipped": len(result["records"]),
                    "already_imported": True,
                }
            existing = store.list(kind, pid, db)
            for r in result["records"]:
                if r["row"] in skip_rows:
                    skipped += 1
                    continue
                data = r["data"]
                old = next(
                    (
                        e
                        for e in existing
                        if (kind == "times" and e.get("source_id") == r["source_key"])
                        or (
                            kind == "deliverables"
                            and data.get("code")
                            and e.get("code") == data["code"]
                            and e.get("system") == data.get("system")
                        )
                    ),
                    None,
                )
                if old and kind == "times":
                    skipped += 1
                    continue
                if old:
                    body = {k: v for k, v in old.items() if k in MODELS[kind].model_fields}
                    body.update({k: data[k] for k in r["fields"] if k in data})
                    # Preserve manual review conclusions and formal results across source refreshes.
                    saved = store.write(
                        kind, validate(kind, body, old["id"], db), old["id"], old["version"], db
                    )
                    updated += 1
                else:
                    saved = store.write(kind, validate(kind, data, db=db), db=db)
                    existing.append(saved)
                    inserted += 1
                ids.append(saved["id"])
            batch = uuid4().hex
            db.execute(
                "INSERT INTO batches VALUES(?,?,?,?,?,?,?)",
                (batch, pid, kind, fingerprint, json.dumps(mapping), json.dumps(ids), now()),
            )
        return {
            "batch_id": batch,
            "inserted": inserted,
            "updated": updated,
            "skipped": skipped,
            "errors_skipped": len(result["errors"]),
        }

    @app.get("/api/import/batches")
    def batches():
        with store.connect() as db:
            return [
                dict(r)
                for r in db.execute("SELECT id,project_id,kind,mapping,at FROM batches ORDER BY at DESC")
            ]

    @app.get("/api/profiles")
    def profiles():
        with store.connect() as db:
            return [
                {"id": r["id"], **json.loads(r["payload"])}
                for r in db.execute("SELECT * FROM profiles WHERE id!='local-settings'")
            ]

    @app.post("/api/profiles")
    def save_profile(payload: dict):
        if (
            not payload.get("name")
            or payload.get("kind") not in MODELS
            or not isinstance(payload.get("mapping"), dict)
        ):
            raise HTTPException(422, "匯入設定格式錯誤")
        ident = uuid4().hex
        with store.connect() as db:
            db.execute("INSERT INTO profiles VALUES(?,?)", (ident, json.dumps(payload, ensure_ascii=False)))
        return {"id": ident, **payload}

    @app.get("/api/exports/{kind}")
    def export_records(kind: str, project_id: str, fmt: str = "csv"):
        check_kind(kind)
        if fmt not in {"csv", "xlsx"}:
            raise HTTPException(422, "匯出格式錯誤")
        content = export_table(records(kind, project_id), fmt)
        media = (
            "text/csv"
            if fmt == "csv"
            else "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        return Response(
            content,
            media_type=media,
            headers={"Content-Disposition": f'attachment; filename="records.{fmt}"'},
        )

    @app.post("/api/reports")
    def report(payload: dict):
        pid = payload.get("project_id")
        project, summary, scenarios = project_bundle(
            pid, payload.get("start") or None, payload.get("end") or None
        )
        scenario = next((s for s in scenarios if s["id"] == payload.get("scenario_id")), None)
        snapshot = make_snapshot(
            project,
            summary,
            store.list("issues", pid),
            store.list("works", pid),
            store.list("deliverables", pid),
            bool(payload.get("external")),
            str(payload.get("title", ""))[:250],
            scenario,
        )
        sections = [
            s
            for s in payload.get("sections", ["effort", "issues", "works", "deliverables"])
            if s in {"effort", "issues", "works", "deliverables", "scenario"}
        ]
        snapshot["sections"] = sections
        snapshot["period"] = {"start": payload.get("start"), "end": payload.get("end")}
        ident = uuid4().hex
        with store.connect() as db:
            db.execute(
                "INSERT INTO reports VALUES(?,?,?)", (ident, json.dumps(snapshot, ensure_ascii=False), now())
            )
        return {"id": ident, "snapshot": snapshot}

    @app.get("/api/reports")
    def report_history():
        with store.connect() as db:
            return [
                {
                    "id": r["id"],
                    "at": r["at"],
                    "title": json.loads(r["payload"])["title"],
                    "external": json.loads(r["payload"])["external"],
                }
                for r in db.execute("SELECT * FROM reports ORDER BY at DESC")
            ]

    @app.get("/api/reports/{ident}/pptx")
    def report_download(ident: str):
        with store.connect() as db:
            row = db.execute("SELECT payload FROM reports WHERE id=?", (ident,)).fetchone()
        if not row:
            raise HTTPException(404, "報告不存在")
        snapshot = json.loads(row["payload"])
        return Response(
            make_pptx(snapshot, snapshot["sections"]),
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": 'attachment; filename="project-report.pptx"'},
        )

    @app.post("/api/backups")
    def backup():
        target = store.backup()
        return {"name": target.name, "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}

    @app.get("/api/backups/{name}")
    def download_backup(name: str):
        if not name.startswith("backup-") or not name.endswith(".sqlite3") or Path(name).name != name:
            raise HTTPException(422, "備份名稱錯誤")
        target = store.directory / "backups" / name
        if not target.is_file():
            raise HTTPException(404, "備份不存在")
        return FileResponse(target, filename=name)

    @app.post("/api/demo")
    def demo():
        from .demo import seed

        if store.list("projects"):
            raise HTTPException(409, "示範資料只可載入空白資料庫")
        seed(store)
        return {"loaded": True}

    static = Path(__file__).parent / "static"
    if static.exists():
        app.mount("/", StaticFiles(directory=static, html=True), name="ui")
    return app


app = create_app()
