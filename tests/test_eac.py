import json
import sqlite3
import pytest

from app.analytics import summarize
from app.db import Store
from app.models import Project, Rate, TimeEntry
from conftest import body


def test_entered_eac_is_shared_and_balance_is_automatic(client, project):
    updated = client.put(
        f"/api/records/projects/{project['id']}",
        json={**body(project), "eac": "123456.78", "tax_basis": "unknown"},
    ).json()
    assert updated["eac"] == "123456.78" and "etc" not in updated
    client.post(
        "/api/records/times",
        json={"project_id": project["id"], "person": "Member-A", "date": "2025-01-01", "hours": 8},
    )
    for query in ["", "?start=2025-01-01&end=2025-01-01", "?start=2026-01-01"]:
        summary = client.get(f"/api/analytics/{project['id']}{query}").json()["summary"]
        assert summary["eac"] == "123456.78" and summary["profit"] == "76543.22"
    overview = client.get("/api/overview").json()[0]
    assert overview["metrics"]["eac"] == "123456.78"
    report = client.post("/api/reports", json={"project_id": project["id"]}).json()["snapshot"]
    assert report["summary"]["profit"] == "76543.22"


def test_eac_empty_zero_negative_balance_and_validation(client, project):
    pid = project["id"]
    for value, balance in [(None, None), ("0", "200000.00"), ("250000", "-50000.00")]:
        row = client.get("/api/records/projects").json()[0]
        assert client.put(f"/api/records/projects/{pid}", json={**body(row), "eac": value}).status_code == 200
        summary = client.get(f"/api/analytics/{pid}").json()["summary"]
        assert summary["profit"] == balance
    row = client.get("/api/records/projects").json()[0]
    assert client.put(f"/api/records/projects/{pid}", json={**body(row), "eac": "-1"}).status_code == 422
    assert client.put(f"/api/records/projects/{pid}", json={**body(row), "eac": "123.456"}).status_code == 422
    assert client.put(f"/api/records/projects/{pid}", json={**body(row), "revenue": None}).status_code == 200
    assert client.get(f"/api/analytics/{pid}").json()["summary"]["profit"] is None


def legacy_store(path, rate=True):
    store = Store(path)
    project = Project(
        name="Synthetic legacy", tax_basis="exclusive", hours_per_day=8, revenue=10000
    ).model_dump(mode="json")
    project.pop("eac")
    project["etc"] = "1000"
    project = store.write("projects", project)
    store.write(
        "times",
        TimeEntry(
            project_id=project["id"], person="Member-A", role="Engineer", date="2025-01-01", hours=8
        ).model_dump(mode="json"),
    )
    if rate:
        store.write(
            "rates",
            Rate(project_id=project["id"], role="Engineer", amount=3200, tax_basis="exclusive").model_dump(
                mode="json"
            ),
        )
    with store.connect() as db:
        db.execute("PRAGMA user_version=1")
        db.execute(
            "INSERT INTO reports VALUES('historic',?, 'old')", (json.dumps({"summary": {"eac": "4200.00"}}),)
        )
    return project


def test_migration_preserves_calculated_eac_and_backup(tmp_path):
    path = tmp_path / "data"
    project = legacy_store(path)
    store = Store(path)
    migrated = store.get("projects", project["id"])
    assert migrated["eac"] == "4200.00" and "etc" not in migrated
    assert migrated["version"] == project["version"] + 1
    backups = list((path / "backups").glob("backup-before-eac-*.sqlite3"))
    assert len(backups) == 1
    with sqlite3.connect(backups[0]) as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 1
        assert (
            json.loads(db.execute("SELECT payload FROM records WHERE kind='projects'").fetchone()[0])["etc"]
            == "1000"
        )
    with store.connect() as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 2
        assert (
            json.loads(db.execute("SELECT payload FROM reports WHERE id='historic'").fetchone()[0])[
                "summary"
            ]["eac"]
            == "4200.00"
        )
    Store(path)
    assert len(list((path / "backups").glob("backup-before-eac-*.sqlite3"))) == 1


def test_migration_leaves_unknown_eac_empty(tmp_path):
    path = tmp_path / "data"
    project = legacy_store(path, rate=False)
    migrated = Store(path).get("projects", project["id"])
    assert migrated["eac"] is None


def test_migration_rolls_back_all_projects_on_failure(tmp_path, monkeypatch):
    path = tmp_path / "data"
    project = legacy_store(path)
    with sqlite3.connect(path / "projects.sqlite3") as db:
        row = db.execute("SELECT * FROM records WHERE kind='projects'").fetchone()
        db.execute("INSERT INTO records VALUES(?,?,?,?,?,?,?)", ("second-project", *row[1:]))
    original = Store.write

    def fail_second(self, kind, payload, ident=None, expected=None, db=None):
        if ident == "second-project":
            raise RuntimeError("Synthetic migration failure")
        return original(self, kind, payload, ident, expected, db)

    monkeypatch.setattr(Store, "write", fail_second)
    with pytest.raises(RuntimeError):
        Store(path)
    with sqlite3.connect(path / "projects.sqlite3") as db:
        assert db.execute("PRAGMA user_version").fetchone()[0] == 1
        for row in db.execute("SELECT payload FROM records WHERE kind='projects'"):
            payload = json.loads(row[0])
            assert "etc" in payload and "eac" not in payload
        assert (
            db.execute("SELECT version FROM records WHERE id=?", (project["id"],)).fetchone()[0]
            == project["version"]
        )


def test_manual_eac_is_independent_of_actual_cost():
    project = Project(name="Synthetic", revenue="1234.56", eac="789.10").model_dump(mode="json")
    result = summarize(project, [], [])
    assert result["profit"] == "445.46"


def test_etc_is_full_eac_minus_full_ac_with_date_filters(client, project):
    pid = project["id"]
    client.post(
        "/api/records/rates",
        json={"project_id": pid, "role": "Engineer", "amount": "3200", "tax_basis": "exclusive"},
    )
    for date in ["2024-12-31", "2025-01-01"]:
        client.post(
            "/api/records/times",
            json={"project_id": pid, "person": "Member-A", "role": "Engineer", "date": date, "hours": 8},
        )
    row = client.get("/api/records/projects").json()[0]
    client.put(f"/api/records/projects/{pid}", json={**body(row), "other_cost": "600"})
    for query in ["", "?start=2025-01-01", "?start=2026-01-01"]:
        summary = client.get(f"/api/analytics/{pid}{query}").json()["summary"]
        assert summary["actual_cost"] == "7000.00"
        assert summary["eac"] == "20000.00" and summary["etc"] == "13000.00"
        assert summary["profit"] == "180000.00"
    row = client.get("/api/records/projects").json()[0]
    client.put(f"/api/records/projects/{pid}", json={**body(row), "eac": "6000"})
    assert client.get(f"/api/analytics/{pid}").json()["summary"]["etc"] == "-1000.00"


def test_etc_is_unknown_when_cost_mapping_missing_outside_filter(client, project):
    pid = project["id"]
    client.post(
        "/api/records/times",
        json={"project_id": pid, "person": "Member-A", "role": "Unmapped", "date": "2024-12-31", "hours": 8},
    )
    result = client.get(f"/api/analytics/{pid}?start=2025-01-01").json()["summary"]
    assert result["missing_rate_rows"] == 0 and result["full_missing_rate_rows"] == 1
    assert result["actual_cost"] is None and result["etc"] is None
    assert result["eac"] == "20000.00" and result["profit"] == "180000.00"
