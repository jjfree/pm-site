from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP


def amount(value):
    return None if value is None or value == "" else Decimal(str(value))


def money(value):
    return None if value is None else str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def select_rate(rates, role, person, day, purpose):
    matches = [
        r
        for r in rates
        if r["purpose"] == purpose
        and r["role"] == role
        and r["start"] <= day
        and (not r.get("end") or day <= r["end"])
        and r["person"] in ("", person)
    ]
    specific = [r for r in matches if r["person"] and r["person"] == person]
    matches = specific or matches
    return matches[0] if len(matches) == 1 else None


def summarize(project, times, rates, start=None, end=None):
    selected = [t for t in times if (not start or t["date"] >= start) and (not end or t["date"] <= end)]
    hours = Decimal("0")
    monthly, categories, people = defaultdict(Decimal), defaultdict(Decimal), defaultdict(Decimal)
    hpd = amount(project.get("hours_per_day"))
    for t in selected:
        hrs = amount(t["hours"])
        hours += hrs
        monthly[t["date"][:7]] += hrs
        categories[t.get("category") or "未分類"] += hrs
        people[t["person"]] += hrs

    def labor_cost(entries):
        cost, mapped, missing = Decimal("0"), Decimal("0"), 0
        for t in entries:
            r = select_rate(rates, t.get("role", ""), t["person"], t["date"], "cost")
            if (
                r is None
                or (r["unit"] == "day" and hpd is None)
                or r["tax_basis"] != project["tax_basis"]
                or r["tax_basis"] == "unknown"
            ):
                missing += 1
                continue
            hrs = amount(t["hours"])
            cost += hrs * amount(r["amount"]) / (hpd if r["unit"] == "day" else Decimal("1"))
            mapped += hrs
        return cost, mapped, missing

    known_cost, mapped_hours, missing = labor_cost(selected)
    # Date filters affect actual effort; the entered forecast always covers the whole project.
    scope_matches = not start and not end
    full_cost, _, full_missing = (known_cost, mapped_hours, missing) if scope_matches else labor_cost(times)
    total = full_cost + amount(project["other_cost"]) if full_missing == 0 else None
    budget_scope = not project.get("budget_start") and not project.get("budget_end")
    eac = amount(project.get("eac"))
    etc = eac - total if eac is not None and total is not None else None
    revenue = amount(project.get("revenue"))
    profit = revenue - eac if revenue is not None and eac is not None else None

    def series(data):
        return [{"name": k, "hours": float(v)} for k, v in sorted(data.items())]

    return {
        "hours": str(hours),
        "md": money(hours / hpd) if hpd else None,
        "known_labor_cost": money(known_cost),
        "actual_cost": money(total),
        "missing_rate_rows": missing,
        "full_missing_rate_rows": full_missing,
        "mapped_hours": str(mapped_hours),
        "rows": len(selected),
        "eac": money(eac),
        "etc": money(etc),
        "profit": money(profit),
        "budget": project.get("budget") if budget_scope else None,
        "revenue": project.get("revenue"),
        "currency": project["currency"],
        "tax_basis": project["tax_basis"],
        "scope_matches": budget_scope,
        "monthly": series(monthly),
        "categories": series(categories),
        "people": series(people),
    }


def evaluate_scenario(project, scenario, rates, summary):
    extra = amount(scenario.get("additional_revenue"))
    if extra is None and scenario.get("billable_md") is not None and scenario.get("rate_date"):
        r = select_rate(rates, scenario.get("sale_role", ""), "", scenario["rate_date"], "sale")
        if (
            r
            and r["unit"] == "day"
            and r["tax_basis"] == project["tax_basis"]
            and r["tax_basis"] != "unknown"
        ):
            extra = amount(r["amount"]) * amount(scenario["billable_md"])
    removed, revenue = amount(scenario["removed_value"]), amount(project.get("revenue"))
    revised = revenue - removed + extra if revenue is not None and extra is not None else None
    delta = amount(scenario.get("cost_change"))
    eac = amount(summary.get("eac"))
    revised_cost = eac + delta if eac is not None and delta is not None else None
    profit = revised - revised_cost if revised is not None and revised_cost is not None else None
    return {
        **scenario,
        "replacement_revenue": money(extra),
        "net_revenue_decrease": money(removed - extra) if extra is not None else None,
        "revised_revenue": money(revised),
        "revised_eac": money(revised_cost),
        "revised_profit": money(profit),
    }
