import json


def test_private_defaults_copy_without_modifying_existing_rates(client):
    assert client.get("/api/settings").json() == {"sale_rates": []}
    defaults = {"sale_rates": [{"role": "Analyst", "amount": "8500"}]}
    assert client.put("/api/settings", json=defaults).status_code == 200
    pid = client.post("/api/records/projects", json={"name": "Synthetic", "tax_basis": "exclusive"}).json()["id"]
    rates = client.get(f"/api/records/rates?project_id={pid}").json()
    assert rates[0]["purpose"] == "sale" and rates[0]["amount"] == "8500" and rates[0]["unit"] == "day"
    assert client.put("/api/settings", json={"sale_rates": []}).status_code == 200
    assert client.get(f"/api/records/rates?project_id={pid}").json()[0]["amount"] == "8500"
    assert (
        client.put("/api/settings", json={"sale_rates": [defaults["sale_rates"][0]] * 2}).status_code == 422
    )


def test_legacy_sale_default_tax_is_ignored_and_project_is_source(client):
    legacy = {"sale_rates": [{"role": "Analyst", "amount": "8500", "tax_basis": "unknown"}]}
    with client.app.state.store.connect() as db:
        db.execute("INSERT OR REPLACE INTO profiles VALUES('local-settings',?)", (json.dumps(legacy),))
    assert "tax_basis" not in client.get("/api/settings").json()["sale_rates"][0]
    assert client.put("/api/settings", json=legacy).status_code == 200
    pid = client.post("/api/records/projects", json={"name": "Synthetic", "tax_basis": "inclusive"}).json()["id"]
    assert "tax_basis" not in client.get(f"/api/records/rates?project_id={pid}").json()[0]
