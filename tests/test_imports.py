import io
from zipfile import ZipFile, ZIP_DEFLATED
from openpyxl import Workbook
from app.imports import prepare, read_tables
from conftest import body


def upload(client, content, filename="synthetic.csv"):
    r = client.post("/api/import/inspect", files={"file": (filename, content)})
    assert r.status_code == 200
    return r.json()


def test_sensitive_and_unnamed_columns_excluded(client, project):
    u = upload(client, "title,password,,notes\nItem,do-not-copy,hidden,password=do-not-copy\n".encode())
    assert u["sheets"][0]["headers"][1]["excluded"]
    assert u["sheets"][0]["headers"][2]["excluded"]
    payload = {
        "upload_id": u["id"],
        "sheet": "CSV",
        "kind": "deliverables",
        "project_id": project["id"],
        "mapping": {"title": "0", "notes": "3"},
    }
    r = client.post("/api/import/preview", json=payload)
    assert "do-not-copy" not in r.text
    payload["mapping"]["notes"] = "1"
    assert client.post("/api/import/preview", json=payload).status_code == 422


def test_markers_are_not_pass():
    rows = [["title", "source_marker"], ["A", "OK"], ["B", "N/A"], ["C", "?"]]
    result = prepare("deliverables", "P", rows, {"title": "0", "source_marker": "1"})["records"]
    assert result[0]["data"]["review"] == "complete" and result[0]["data"]["result"] == "unknown"
    assert result[1]["data"]["applicable"] is False
    assert result[2]["data"]["review"] == "question"


def test_dates_duplicates_and_idempotence(client, project):
    content = "person,date,hours,role\nMember-A,113/12/31,8,Engineer\nMember-A,113/12/31,8,Engineer\nMember-B,not-a-date,-2,Engineer\n".encode()
    u = upload(client, content)
    payload = {"upload_id": u["id"], "sheet": "CSV", "kind": "times", "project_id": project["id"]}
    preview = client.post("/api/import/preview", json=payload).json()
    assert preview["duplicate_candidates"] == 1 and len(preview["errors"]) == 1
    assert preview["records"][0]["data"]["date"] == "2024-12-31"
    assert client.post("/api/import/commit", json=payload).status_code == 422
    first = client.post("/api/import/commit", json={**payload, "skip_errors": True}).json()
    assert first["inserted"] == 2
    assert client.post("/api/import/commit", json={**payload, "skip_errors": True}).json()["already_imported"]
    u2 = upload(client, content + b"\n")
    second = client.post(
        "/api/import/commit", json={**payload, "upload_id": u2["id"], "skip_errors": True}
    ).json()
    assert second["inserted"] == 0 and second["skipped"] == 2


def test_deliverable_refresh_preserves_manual_conclusions(client, project):
    content = b"code,title,source_marker\nF-1,First,OK\n"
    u = upload(client, content)
    payload = {"upload_id": u["id"], "sheet": "CSV", "kind": "deliverables", "project_id": project["id"]}
    assert client.post("/api/import/commit", json=payload).json()["inserted"] == 1
    row = client.get("/api/records/deliverables").json()[0]
    assert (
        client.put(
            f"/api/records/deliverables/{row['id']}",
            json={**body(row), "review": "question", "result": "fail", "evidence": "Manual evidence"},
        ).status_code
        == 200
    )
    u = upload(client, b"code,title,source_marker\nF-1,Updated,N/A\n")
    assert client.post("/api/import/commit", json={**payload, "upload_id": u["id"]}).json()["updated"] == 1
    row = client.get("/api/records/deliverables").json()[0]
    assert (
        row["title"] == "Updated"
        and row["review"] == "question"
        and row["result"] == "fail"
        and row["evidence"] == "Manual evidence"
    )


def test_batch_rolls_back_on_validation_conflict(client, project):
    u = upload(client, b"role,amount,start,tax_basis\nEngineer,3200,2024-01-01,exclusive\nEngineer,4000,2024-02-01,exclusive\n")
    payload = {"upload_id": u["id"], "sheet": "CSV", "kind": "rates", "project_id": project["id"]}
    assert client.post("/api/import/commit", json=payload).status_code == 409
    assert client.get("/api/records/rates").json() == []
    assert client.get("/api/import/batches").json() == []


def test_rate_import_requires_tax_basis():
    missing = prepare("rates", "P", [["role", "amount"], ["Engineer", "3200"]], {"role": "0", "amount": "1"})
    assert missing["row_count"] == 1 and missing["errors"][0]["row"] == 2
    mapped = prepare(
        "rates", "P", [["role", "amount", "稅別"], ["Engineer", "3200", "含稅"]],
        {"role": "0", "amount": "1", "tax_basis": "2"},
    )
    assert mapped["records"][0]["data"]["tax_basis"] == "inclusive"


def test_incorrect_xlsx_dimensions_and_formula_cache():
    wb = Workbook()
    wb.active.append(["person", "date", "hours"])
    wb.active.append(["Member-A", "2025-01-01", 8])
    wb.active.append(["Member-B", "2025-01-02", "=4+4"])
    stream = io.BytesIO()
    wb.save(stream)
    rewritten = io.BytesIO()
    with ZipFile(io.BytesIO(stream.getvalue())) as source, ZipFile(rewritten, "w", ZIP_DEFLATED) as dest:
        for name in source.namelist():
            data = source.read(name)
            if name == "xl/worksheets/sheet1.xml":
                data = data.replace(b'ref="A1:C3"', b'ref="A1"')
            dest.writestr(name, data)
    rows = read_tables("synthetic.xlsx", rewritten.getvalue())["Sheet"]
    assert len(rows) == 3
    result = prepare("times", "P", rows, {"person": "0", "date": "1", "hours": "2"})
    assert len(result["records"]) == 1 and len(result["errors"]) == 1


def test_file_limits_and_invalid_format(client):
    assert client.post("/api/import/inspect", files={"file": ("bad.xlsx", b"not a zip")}).status_code == 422
    assert client.post("/api/import/inspect", files={"file": ("bad.xls", b"bad")}).status_code == 422
    assert (
        client.post(
            "/api/import/inspect", files={"file": ("large.csv", b"x" * (8 * 1024 * 1024 + 1))}
        ).status_code
        == 422
    )
