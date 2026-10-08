from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Date = date


class Record(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class OtherCostItem(Record):
    title: str = Field(min_length=1, max_length=160)
    date: Date | None = None
    amount: Decimal = Field(ge=0, max_digits=16, decimal_places=2)
    note: str = Field(default="", max_length=2000)


class Project(Record):
    name: str = Field(min_length=1, max_length=160)
    code: str = Field(min_length=1, max_length=60)
    client: str = Field(default="", max_length=160)
    owner: str = Field(default="", max_length=120)
    owner_member_id: str = Field(default="", max_length=32)
    status: Literal["planning", "active", "at_risk", "paused", "completed"] = "active"
    status_reason: str = Field(default="", max_length=2000)
    summary: str = Field(default="", max_length=5000)
    currency: str = Field(default="TWD", pattern=r"^[A-Z]{3}$")
    start: date | None = None
    end: date | None = None
    hours_per_day: Decimal | None = Field(default=None, gt=0, le=24)
    budget: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    revenue: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    eac: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    other_cost: Decimal = Field(default=Decimal("0"), ge=0, max_digits=16, decimal_places=2)
    other_cost_items: list[OtherCostItem] = Field(default_factory=list, max_length=2000)
    tax_basis: Literal["inclusive", "exclusive"]
    budget_start: date | None = None
    budget_end: date | None = None

    @model_validator(mode="after")
    def periods(self):
        for begin, finish in [(self.start, self.end), (self.budget_start, self.budget_end)]:
            if begin and finish and begin > finish:
                raise ValueError("開始日期不可晚於結束日期")
        return self


class Rate(Record):
    project_id: str
    role: str = Field(min_length=1, max_length=100)
    person: str = Field(default="", max_length=120)
    purpose: Literal["cost", "sale"] = "cost"
    amount: Decimal = Field(ge=0, max_digits=16, decimal_places=2)
    unit: Literal["hour", "day"] = "day"
    start: date = date(2000, 1, 1)
    end: date | None = None

    @model_validator(mode="after")
    def periods(self):
        if self.end and self.end < self.start:
            raise ValueError("單價有效期間錯誤")
        return self


class ProjectRole(Record):
    project_id: str
    name: str = Field(min_length=1, max_length=100)
    active: bool = True


class ProjectMember(Record):
    project_id: str
    person: str = Field(min_length=1, max_length=120)
    alias: str = Field(default="", max_length=120)
    role: str = Field(default="", max_length=100)
    active: bool = True


class TimeEntry(Record):
    project_id: str
    person: str = Field(min_length=1, max_length=120)
    date: date
    hours: Decimal = Field(gt=0, le=24, max_digits=7, decimal_places=2)
    role: str = Field(default="", max_length=100)
    category: str = Field(default="", max_length=120)
    content: str = Field(default="", max_length=8000)
    progress: str = Field(default="", max_length=4000)
    source_id: str = Field(default="", max_length=200)


class Issue(Record):
    project_id: str
    number: str = Field(default="", max_length=80)
    title: str = Field(min_length=1, max_length=250)
    kind: Literal["issue", "risk", "change", "decision"] = "issue"
    owner: str = Field(default="", max_length=120)
    owner_member_id: str = Field(default="", max_length=32)
    owner_member_ids: list[str] = Field(default_factory=list, max_length=50)
    priority: Literal["low", "medium", "high", "critical"] = "medium"
    status: Literal["open", "in_progress", "resolved", "closed"] = "open"
    due: date | None = None
    description: str = Field(default="", max_length=8000)
    action: str = Field(default="", max_length=8000)
    decision: str = Field(default="", max_length=4000)
    external_url: str = Field(default="", max_length=2000)


class Work(Record):
    project_id: str
    title: str = Field(min_length=1, max_length=250)
    kind: Literal["task", "milestone"] = "task"
    owner: str = Field(default="", max_length=120)
    owner_member_id: str = Field(default="", max_length=32)
    due: date | None = None
    status: Literal["todo", "doing", "done"] = "todo"


class Deliverable(Record):
    project_id: str
    title: str = Field(min_length=1, max_length=250)
    code: str = Field(default="", max_length=120)
    system: str = Field(default="", max_length=160)
    description: str = Field(default="", max_length=8000)
    control_ref: str = Field(default="", max_length=1000)
    owner: str = Field(default="", max_length=120)
    owner_member_id: str = Field(default="", max_length=32)
    due: date | None = None
    source_marker: str = Field(default="", max_length=100)
    review: Literal["unknown", "complete", "question"] = "unknown"
    applicable: bool | None = None
    applicability_reason: str = Field(default="", max_length=2000)
    result: Literal["unknown", "not_run", "pass", "fail", "blocked"] = "unknown"
    notes: str = Field(default="", max_length=8000)
    evidence: str = Field(default="", max_length=2000)
    checked_on: date | None = None


class Scenario(Record):
    project_id: str
    name: str = Field(min_length=1, max_length=200)
    removed_value: Decimal = Field(default=Decimal("0"), ge=0, max_digits=16, decimal_places=2)
    additional_revenue: Decimal | None = Field(default=None, ge=0, max_digits=16, decimal_places=2)
    cost_change: Decimal | None = Field(default=None, max_digits=16, decimal_places=2)
    billable_md: Decimal | None = Field(default=None, ge=0, max_digits=10, decimal_places=2)
    sale_role: str = Field(default="", max_length=100)
    rate_date: date | None = None
    status: Literal["draft", "approved", "rejected"] = "draft"
    notes: str = Field(default="", max_length=4000)


class Payment(Record):
    project_id: str
    title: str = Field(min_length=1, max_length=200)
    amount: Decimal = Field(ge=0, max_digits=16, decimal_places=2)
    due: date | None = None
    invoiced: Decimal = Field(default=Decimal("0"), ge=0, max_digits=16, decimal_places=2)
    received: Decimal = Field(default=Decimal("0"), ge=0, max_digits=16, decimal_places=2)


MODELS = {
    "projects": Project,
    "roles": ProjectRole,
    "members": ProjectMember,
    "rates": Rate,
    "times": TimeEntry,
    "issues": Issue,
    "works": Work,
    "deliverables": Deliverable,
    "scenarios": Scenario,
    "payments": Payment,
}


class SaleDefault(Record):
    role: str = Field(min_length=1, max_length=100)
    amount: Decimal = Field(ge=0, max_digits=16, decimal_places=2)


class Settings(Record):
    sale_rates: list[SaleDefault] = Field(default_factory=list, max_length=50)

    @model_validator(mode="after")
    def unique_roles(self):
        if len({r.role for r in self.sale_rates}) != len(self.sale_rates):
            raise ValueError("預設售價角色不可重複")
        return self
