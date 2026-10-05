"""Entirely synthetic demo records; never based on user uploads."""

from datetime import date, timedelta


def seed(store):
    today = date.today()
    with store.connect() as db:
        for index, (name, status, budget) in enumerate(
            [
                ("城市服務入口", "active", "950000"),
                ("資料整合平台", "at_risk", "620000"),
                ("內部流程改善", "planning", "380000"),
            ]
        ):
            from .models import MODELS

            def save(entity_kind, **body):
                return store.write(
                    entity_kind, MODELS[entity_kind].model_validate(body).model_dump(mode="json"), db=db
                )

            project = save(
                "projects",
                name=name,
                code=f"DEMO-{index + 1:02}",
                owner=f"PM-{index + 1}",
                status=status,
                summary="此專案為完全合成的示範資料，可用來體驗管理流程。",
                budget=budget,
                revenue=str(int(budget) * 2),
                eac="159600",
                hours_per_day="8",
                tax_basis="exclusive",
                start=str(today - timedelta(days=120)),
                end=str(today + timedelta(days=90)),
            )
            pid = project["id"]
            for role, value in [("PM", "5600"), ("Engineer", "4800")]:
                save("rates", project_id=pid, role=role, amount=value, purpose="cost")
                save("rates", project_id=pid, role=role, amount="9200", purpose="sale")
            for offset in range(1, 13):
                day = today - timedelta(days=offset * 9)
                save(
                    "times",
                    project_id=pid,
                    person=f"Member-{index + 1}",
                    role="Engineer",
                    date=str(day),
                    hours=str(4 + offset % 4),
                    category=["規劃", "開發", "檢視"][offset % 3],
                    content="合成工作紀錄",
                )
            save(
                "issues",
                project_id=pid,
                title="確認交付範圍",
                kind="issue",
                priority="high",
                owner=f"PM-{index + 1}",
                due=str(today + timedelta(days=7)),
                action="安排範圍檢視並記錄結論",
            )
            save(
                "issues",
                project_id=pid,
                title="外部資料可用性",
                kind="risk",
                priority="medium",
                status="in_progress",
            )
            save(
                "works",
                project_id=pid,
                title="階段成果檢視",
                kind="milestone",
                due=str(today + timedelta(days=21)),
            )
            save(
                "works",
                project_id=pid,
                title="更新操作說明",
                due=str(today - timedelta(days=2)),
                owner=f"Member-{index + 1}",
            )
            save("deliverables", project_id=pid, title="操作說明文件", code="DOC-001", review="complete")
            save(
                "scenarios",
                project_id=pid,
                name="服務替代試算",
                removed_value="80000",
                billable_md="10",
                sale_role="Engineer",
                rate_date=str(today),
                cost_change="16000",
            )
