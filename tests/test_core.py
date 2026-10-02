import io
import json
import sqlite3
from zipfile import ZipFile

from openpyxl import load_workbook
from pptx import Presentation
from app.analytics import evaluate_scenario, summarize
from app.models import Project, Rate, Scenario, TimeEntry
from app.reports import export_table, make_pptx, make_snapshot
from conftest import body


def model(cls, **kw):
    return cls(**kw).model_dump(mode="json")


def test_synthetic_demo_is_complete_and_only_for_empty_database(client):
    assert client.post("/api/demo").status_code == 200
    assert len(client.get("/api/records/projects").json()) == 3
    assert len(client.get("/api/records/issues").json()) == 6
    assert len(client.get("/api/records/works").json()) == 6
    assert len(client.get("/api/records/times").json()) == 36
    assert client.post("/api/demo").status_code == 409


def test_local_security(client):
    assert client.get("/api/overview", headers={"Host": "evil.example"}).status_code == 403
    assert client.get("/api/overview", headers={"sec-fetch-site": "cross-site"}).status_code == 403
    assert (
        client.post("/api/records/projects", json={"name": "X"}, headers={"x-csrf-token": "bad"}).status_code
        == 403
    )
    assert (
        client.post(
            "/api/records/projects", json={"name": "X"}, headers={"origin": "https://evil.example"}
        ).status_code
        == 403
    )
    client.cookies.clear()
    assert client.get("/api/overview").status_code == 401


def test_crud_version_and_relations(client, project):
    pid = project["id"]
    updated = client.put(f"/api/records/projects/{pid}", json={**body(project), "summary": "Changed"})
    assert updated.json()["version"] == 2
    assert client.put(f"/api/records/projects/{pid}", json=body(project)).status_code == 409
    assert client.post("/api/records/issues", json={"project_id": "missing", "title": "X"}).status_code == 422
    issue = client.post("/api/records/issues", json={"project_id": pid, "title": "X"}).json()
    assert client.delete(f"/api/records/projects/{pid}?version=2").status_code == 409
    assert client.delete(f"/api/records/issues/{issue['id']}?version=1").status_code == 200
    assert client.delete(f"/api/records/projects/{pid}?version=2").status_code == 200


def test_validation_and_rate_overlap(client, project):
    rate = {
        "project_id": project["id"],
        "role": "Engineer",
        "amount": "3200",
        "start": "2024-01-01",
        "end": "2024-12-31",
    }
    assert client.post("/api/records/rates", json=rate).status_code == 200
    assert client.post("/api/records/rates", json={**rate, "start": "2024-12-31"}).status_code == 409
    assert (
        client.post("/api/records/rates", json={**rate, "start": "2025-01-01", "end": None}).status_code
        == 200
    )
    assert client.post("/api/records/rates", json={**rate, "amount": "-1"}).status_code == 422
    assert (
        client.post(
            "/api/records/projects", json={"name": "X", "start": "2025-02-01", "end": "2025-01-01"}
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/records/issues",
            json={"project_id": project["id"], "title": "X", "external_url": "javascript:alert(1)"},
        ).status_code
        == 422
    )


def test_assigning_time_role_updates_same_person_and_cost(client, project):
    pid = project["id"]
    client.post(
        "/api/records/rates",
        json={"project_id": pid, "role": "Engineer", "amount": "4000", "tax_basis": "exclusive"},
    )
    entries = [
        client.post(
            "/api/records/times",
            json={"project_id": pid, "person": person, "date": "2025-01-01", "hours": 8, "role": role},
        ).json()
        for person, role in [("Member-A", ""), ("Member-A", "Old"), ("Member-B", "")]
    ]
    other_project = client.post("/api/records/projects", json={"name": "Other project"}).json()
    outside = client.post(
        "/api/records/times",
        json={"project_id": other_project["id"], "person": "Member-A", "date": "2025-01-01", "hours": 8},
    ).json()

    response = client.put(
        f"/api/records/times/{entries[0]['id']}",
        json={**body(entries[0]), "role": "Engineer", "apply_role_to_person": True},
    )
    assert response.status_code == 200
    rows = client.get(f"/api/records/times?project_id={pid}").json()
    assert [row["role"] for row in rows] == ["Engineer", "Engineer", ""]
    assert rows[1]["version"] == entries[1]["version"] + 1
    assert client.get(f"/api/records/times?project_id={other_project['id']}").json()[0]["role"] == ""
    assert client.get(f"/api/analytics/{pid}").json()["summary"]["known_labor_cost"] == "8000.00"

    stale = client.put(
        f"/api/records/times/{entries[0]['id']}",
        json={**body(entries[0]), "role": "Engineer", "apply_role_to_person": True},
    )
    assert stale.status_code == 409
    assert client.get(f"/api/records/times?project_id={pid}").json() == rows
    assert client.get(f"/api/records/times?project_id={other_project['id']}").json()[0] == outside


def fixtures():
    p = model(
        Project,
        name="Synthetic",
        hours_per_day=8,
        revenue=200000,
        eac=27200,
        budget=90000,
        tax_basis="exclusive",
    )
    rates = [
        model(Rate, project_id="P", role="Engineer", amount=3200, end="2024-12-31", tax_basis="exclusive"),
        model(Rate, project_id="P", role="Engineer", amount=4000, start="2025-01-01", tax_basis="exclusive"),
    ]
    times = [
        model(TimeEntry, project_id="P", person="Member-A", role="Engineer", date=d, hours=8)
        for d in ["2024-12-31", "2025-01-01"]
    ]
    return p, times, rates


def test_cross_year_cost_and_filtered_scope():
    p, times, rates = fixtures()
    s = summarize(p, times, rates)
    assert s["hours"] == "16" and s["md"] == "2.00"
    assert s["actual_cost"] == "7200.00" and s["eac"] == "27200.00"
    assert s["profit"] == "172800.00"
    filtered = summarize(p, times, rates, "2025-01-01")
    assert filtered["known_labor_cost"] == "4000.00"
    assert filtered["eac"] == "27200.00" and filtered["profit"] == "172800.00"
    assert filtered["actual_cost"] == "7200.00" and filtered["budget"] == "90000"
    assert filtered["etc"] == "20000.00"


def test_missing_is_not_zero_and_tax_basis():
    p, times, rates = fixtures()
    s = summarize(p, times, rates[:1])
    assert s["known_labor_cost"] == "3200.00" and s["missing_rate_rows"] == 1
    assert s["actual_cost"] is None
    assert s["eac"] == "27200.00" and s["profit"] == "172800.00"
    rates[1]["tax_basis"] = "inclusive"
    assert summarize(p, times, rates)["actual_cost"] is None
    p["hours_per_day"] = None
    assert summarize(p, times, rates)["md"] is None
    rates[0]["unit"] = "hour"
    assert summarize(p, times[:1], rates)["known_labor_cost"] == "25600.00"


def test_person_rate_and_scenario_unknown():
    p, times, rates = fixtures()
    rates.append({**rates[1], "person": "Member-A", "amount": "4500"})
    s = summarize(p, times, rates)
    assert s["known_labor_cost"] == "7700.00"
    scenario = model(Scenario, project_id="P", name="Option", removed_value=30000)
    assert evaluate_scenario(p, scenario, rates, s)["net_revenue_decrease"] is None
    rates.append(
        model(Rate, project_id="P", role="Engineer", purpose="sale", amount=8000, tax_basis="exclusive")
    )
    scenario.update(billable_md="2", sale_role="Engineer", rate_date="2025-01-01", cost_change="1000")
    result = evaluate_scenario(p, scenario, rates, s)
    assert result["replacement_revenue"] == "16000.00" and result["net_revenue_decrease"] == "14000.00"
    assert result["revised_eac"] == "28200.00"
    scenario["additional_revenue"] = "0"
    assert evaluate_scenario(p, scenario, rates, s)["replacement_revenue"] == "0.00"


def test_backup_integrity(client, project):
    r = client.post("/api/backups").json()
    binary = client.get("/api/backups/" + r["name"])
    assert binary.status_code == 200 and len(r["sha256"]) == 64
    store = client.app.state.store
    with sqlite3.connect(store.directory / "backups" / r["name"]) as db:
        assert db.execute("PRAGMA integrity_check").fetchone()[0] == "ok"
        assert db.execute("SELECT count(*) FROM records").fetchone()[0] == 1


def test_export_formula_injection():
    rows = [{"title": '=HYPERLINK("https://invalid.example")', "content": "  @bad", "hours": "8"}]
    assert "'=HYPERLINK" in export_table(rows).decode("utf-8-sig")
    wb = load_workbook(io.BytesIO(export_table(rows, "xlsx")))
    assert all(c.data_type != "f" for row in wb.active for c in row)


def test_report_whitelist_and_native_chart(client, project):
    client.post(
        "/api/records/issues",
        json={
            "project_id": project["id"],
            "title": "Visible",
            "owner": "Private-member",
            "description": "Private-note",
        },
    )
    client.post(
        "/api/records/times",
        json={"project_id": project["id"], "person": "Private-member", "date": "2025-01-01", "hours": 8},
    )
    response = client.post("/api/reports", json={"project_id": project["id"], "external": True}).json()
    serialized = json.dumps(response["snapshot"])
    assert (
        "Private-member" not in serialized
        and "Private-note" not in serialized
        and "revenue" not in serialized
    )
    content = client.get(f"/api/reports/{response['id']}/pptx").content
    prs = Presentation(io.BytesIO(content))
    assert len(prs.slides) >= 2
    with ZipFile(io.BytesIO(content)) as z:
        assert all(b"Private-member" not in z.read(n) for n in z.namelist() if n.endswith(".xml"))
    internal = client.post("/api/reports", json={"project_id": project["id"]}).json()
    binary = client.get(f"/api/reports/{internal['id']}/pptx").content
    with ZipFile(io.BytesIO(binary)) as z:
        assert any(n.startswith("ppt/charts/chart") for n in z.namelist())
    client.put(f"/api/records/projects/{project['id']}", json={**body(project), "name": "Renamed"})
    assert client.get(f"/api/reports/{internal['id']}/pptx").content != b""
    with client.app.state.store.connect() as db:
        saved = json.loads(
            db.execute("SELECT payload FROM reports WHERE id=?", (internal["id"],)).fetchone()[0]
        )
        assert saved["project"]["name"] == "Synthetic project"


def test_report_paginates_all_rows():
    p, times, rates = fixtures()
    snapshot = make_snapshot(
        {**p, "code": "SYN"},
        summarize(p, times, rates),
        [{"title": f"Item {i}", "kind": "issue", "priority": "high", "status": "open"} for i in range(21)],
        [],
        [],
    )
    prs = Presentation(io.BytesIO(make_pptx(snapshot, ["issues"])))
    texts = [
        cell.text
        for s in prs.slides
        for shape in s.shapes
        if shape.has_table
        for row in shape.table.rows
        for cell in row.cells
    ]
    assert all(f"Item {i}" in texts for i in range(21))


def test_long_report_content_fits_and_is_retained():
    p, times, rates = fixtures()
    p.update(code="SYN", name="長專案名稱" * 25, summary="完整的專案摘要。" * 300)
    rows = [{"title": "議題內容" * 60, "kind": "issue", "priority": "high", "status": "open"}] * 5
    snapshot = make_snapshot(p, summarize(p, times, rates), rows, [], [], title="長報告標題" * 30)
    prs = Presentation(io.BytesIO(make_pptx(snapshot, ["issues"])))
    for slide in prs.slides:
        for shape in slide.shapes:
            assert shape.top + shape.height <= prs.slide_height
    assert any(
        "完整的專案摘要" in shape.text
        for slide in prs.slides
        for shape in slide.shapes
        if shape.has_text_frame
    )
    assert p["name"] in prs.slides[0].notes_slide.notes_text_frame.text
