import pytest
from fastapi.testclient import TestClient
from app.api import create_app


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "data")) as c:
        c.headers["x-csrf-token"] = c.get("/api/bootstrap").json()["csrf"]
        yield c


@pytest.fixture
def project(client):
    r = client.post(
        "/api/records/projects",
        json={
            "name": "Synthetic project",
            "code": "SYN",
            "revenue": "200000",
            "budget": "90000",
            "eac": "20000",
            "hours_per_day": "8",
            "tax_basis": "exclusive",
        },
    )
    assert r.status_code == 200
    return r.json()


def body(row):
    return {k: v for k, v in row.items() if k not in {"id", "created", "updated"}}
