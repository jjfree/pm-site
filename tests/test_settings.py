def test_private_defaults_copy_without_modifying_existing_rates(client):
    assert client.get("/api/settings").json() == {"sale_rates": []}
    defaults = {"sale_rates": [{"role": "Analyst", "amount": "8500", "tax_basis": "exclusive"}]}
    assert client.put("/api/settings", json=defaults).status_code == 200
    pid = client.post("/api/records/projects", json={"name": "Synthetic"}).json()["id"]
    rates = client.get(f"/api/records/rates?project_id={pid}").json()
    assert rates[0]["purpose"] == "sale" and rates[0]["amount"] == "8500" and rates[0]["unit"] == "day"
    assert client.put("/api/settings", json={"sale_rates": []}).status_code == 200
    assert client.get(f"/api/records/rates?project_id={pid}").json()[0]["amount"] == "8500"
    assert (
        client.put("/api/settings", json={"sale_rates": [defaults["sale_rates"][0]] * 2}).status_code == 422
    )
