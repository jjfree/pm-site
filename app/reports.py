import csv
import io
import math
from datetime import datetime, timedelta, timezone

from openpyxl import Workbook
from pptx import Presentation
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.util import Inches, Pt


def safe_text(value):
    value = "" if value is None else str(value)
    return "'" + value if value.lstrip().startswith(("=", "+", "-", "@")) else value


def export_table(rows, fmt="csv"):
    columns = sorted({k for row in rows for k in row if k not in {"created", "updated"}})
    if fmt == "xlsx":
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Records"
        sheet.append(columns)
        for row in rows:
            sheet.append([safe_text(row.get(k)) for k in columns])
        sheet.freeze_panes = "A2"
        sheet.auto_filter.ref = sheet.dimensions
        stream = io.BytesIO()
        workbook.save(stream)
        return stream.getvalue()
    stream = io.StringIO(newline="")
    writer = csv.writer(stream)
    writer.writerow(columns)
    writer.writerows([[safe_text(row.get(k)) for k in columns] for row in rows])
    return stream.getvalue().encode("utf-8-sig")


def make_snapshot(project, summary, issues, works, deliverables, external=False, title="", scenario=None):
    if external:
        # Build a new public-facing snapshot from an explicit whitelist.
        return {
            "project": {k: project[k] for k in ["name", "code", "status", "summary"]},
            "summary": {},
            "issues": [
                {
                    **{k: i[k] for k in ["title", "kind", "status", "priority"]},
                    "number": i.get("number", ""),
                    "due": i.get("due"),
                    "created": i.get("created", ""),
                    "status_history": [
                        {k: event[k] for k in ("at", "status")}
                        for event in i.get("status_history", [])
                    ],
                }
                for i in issues
            ],
            "works": [{k: i[k] for k in ["title", "kind", "due", "status"]} for i in works],
            "deliverables": [
                {k: i[k] for k in ["title", "code", "review", "applicable", "result"]} for i in deliverables
            ],
            "at": datetime.now(timezone(timedelta(hours=8))).isoformat(),
            "title": title,
            "external": True,
            "scenario": None,
        }
    return {
        "project": project,
        "summary": summary,
        "issues": issues,
        "works": works,
        "deliverables": deliverables,
        "at": datetime.now(timezone(timedelta(hours=8))).isoformat(),
        "title": title,
        "external": False,
        "scenario": scenario,
    }


def make_pptx(snapshot, sections):
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    navy, teal = RGBColor(24, 38, 54), RGBColor(19, 137, 128)

    def clipped(content, limit):
        result, units = "", 0
        for char in str(content):
            units += 1 if ord(char) > 127 else 0.6
            if units > limit:
                return result + "…"
            result += char
        return result

    def slide(title):
        s = prs.slides.add_slide(prs.slide_layouts[6])
        text(s, clipped(title, 27), 0.65, 0.55, 12, 0.7, 30, navy)
        s.notes_slide.notes_text_frame.text = str(title)
        text(
            s,
            f"{clipped(snapshot['project']['name'], 65)}  /  {snapshot['at'][:10]}",
            0.65,
            7.05,
            12,
            0.25,
            10,
            teal,
        )
        return s

    def text(s, content, x, y, w, h, size=20, color=navy):
        box = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        box.text_frame.word_wrap = True
        p = box.text_frame.paragraphs[0]
        p.text = str(content)
        p.font.size, p.font.name, p.font.color.rgb = Pt(size), "Microsoft JhengHei", color
        return box

    def same_issue_owner(a, b):
        if a.get("owner_member_id") and a.get("owner_member_id") == b.get("owner_member_id"):
            return True
        label_a = a.get("owner_alias") or a.get("owner") or "未指定"
        label_b = b.get("owner_alias") or b.get("owner") or "未指定"
        return str(label_a).strip().casefold() == str(label_b).strip().casefold()

    def issue_timeline(rows):
        if not rows:
            return
        colors = {
            "open": RGBColor(148, 163, 173),
            "in_progress": RGBColor(71, 121, 181),
            "resolved": RGBColor(70, 148, 112),
            "closed": RGBColor(83, 99, 108),
        }
        status_names = {"open": "待處理", "in_progress": "處理中", "resolved": "已解決", "closed": "已結案"}
        dated = [row for row in rows if row.get("created") and row.get("due")]
        starts = [row["created"][:10] for row in dated]
        ends = [max(row["due"], row["created"][:10]) for row in dated]
        if not starts:
            s = slide("事項追蹤甘特圖")
            text(s, "事項尚未設定期限，無法繪製追蹤區間", 0.8, 1.8, 11.5, 0.6, 18)
            return
        low, high = min(starts), max(ends)
        start_day = datetime.fromisoformat(low).date()
        end_day = datetime.fromisoformat(high).date()
        span = max(1, (end_day - start_day).days + 1)
        pages = [rows[i:i + 8] for i in range(0, len(rows), 8)]
        for page_index, page_rows in enumerate(pages):
            s = slide("事項追蹤甘特圖" + (f" ({page_index + 1}/{len(pages)})" if len(pages) > 1 else ""))
            left, chart_width, top = 4.35, 8.15, 1.75
            text(s, f"{low} — {high}", left, 1.28, chart_width, 0.3, 10)
            legend_x = 0.75
            for status, color in colors.items():
                swatch = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(legend_x), Inches(1.37), Inches(0.15), Inches(0.15))
                swatch.fill.solid()
                swatch.fill.fore_color.rgb = color
                swatch.line.fill.background()
                text(s, status_names[status], legend_x + 0.2, 1.3, 0.9, 0.25, 9)
                legend_x += 1.1
            for index, row in enumerate(page_rows):
                y = top + index * 0.62
                label = f"{row.get('number', '')} {row.get('title', '')}".strip()
                text(s, clipped(label, 38), 0.72, y, 3.45, 0.27, 10)
                created, due = row.get("created", "")[:10], row.get("due")
                if not created or not due:
                    schedule = "未設定期限" if not due else "未設定建立日"
                    owner = row.get("owner_alias") or row.get("owner") or "未指定"
                    text(s, schedule if snapshot["external"] else f"{schedule} · 負責人：{owner}",
                         left, y, chart_width, 0.28, 9)
                    continue
                row_start = datetime.fromisoformat(created).date()
                row_end = datetime.fromisoformat(due).date()
                if row_end < row_start:
                    row_end = row_start
                row_span = max(1, (row_end - row_start).days + 1)
                x = left + max(0, (row_start - start_day).days) / span * chart_width
                width = min(chart_width - (x - left), row_span / span * chart_width)
                track = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y + 0.02), Inches(width), Inches(0.22))
                track.fill.solid()
                track.fill.fore_color.rgb = RGBColor(235, 240, 242)
                track.line.fill.background()
                history = row.get("status_history") or [{"at": created, "status": row.get("status", "open")}]
                events = []
                for event in history:
                    event_day = event.get("at", "")[:10]
                    if event_day:
                        events.append((max(row_start, datetime.fromisoformat(event_day).date()), event))
                if not events:
                    events = [(row_start, {"status": row.get("status", "open")})]
                events.sort(key=lambda item: item[0])
                collapsed = []
                for event_day, event in events:
                    if collapsed and collapsed[-1][0] == event_day:
                        collapsed[-1] = (event_day, event)
                    else:
                        collapsed.append((event_day, event))
                collapsed = [item for item in collapsed if item[0] <= row_end]
                if not collapsed:
                    collapsed = [(row_start, {"status": row.get("status", "open"),
                                               "owner": row.get("owner", ""),
                                               "owner_alias": row.get("owner_alias", ""),
                                               "owner_member_id": row.get("owner_member_id", "")})]
                for segment_index, (event_day, event) in enumerate(collapsed):
                    next_day = collapsed[segment_index + 1][0] if segment_index + 1 < len(collapsed) else row_end + timedelta(days=1)
                    segment_end = min(row_end + timedelta(days=1), next_day)
                    if segment_end <= event_day:
                        continue
                    offset = (event_day - row_start).days / row_span
                    segment_width = (segment_end - event_day).days / row_span
                    bar = s.shapes.add_shape(
                        MSO_SHAPE.RECTANGLE,
                        Inches(x + offset * width), Inches(y + 0.02),
                        Inches(segment_width * width), Inches(0.22),
                    )
                    bar.fill.solid()
                    bar.fill.fore_color.rgb = colors.get(event.get("status"), colors["open"])
                    bar.line.fill.background()
                    owner_run_end = segment_index == len(collapsed) - 1 or not same_issue_owner(
                        event, collapsed[segment_index + 1][1]
                    )
                    if not snapshot["external"] and owner_run_end and segment_width * width >= 0.28:
                        person = event.get("owner_alias") or event.get("owner") or ""
                        if person:
                            badge_width = min(segment_width * width - 0.04, max(0.24, len(person) * 0.09 + 0.12))
                            badge = text(s, clipped(person, 12), x + offset * width + 0.02,
                                         y + 0.045, badge_width, 0.16, 7)
                            badge.fill.solid()
                            badge.fill.fore_color.rgb = RGBColor(250, 252, 253)
                            badge.line.fill.background()

    def table(title, columns, rows):
        if columns[0][1] == "number":
            widths = [1.7, 3.6, 2.4, 1.4, 1.4, 1.4] if any(
                key == "owner" for _, key in columns
            ) else [1.7, 4.9, 1.8, 1.8, 1.7]
        elif any(key == "owner" for _, key in columns):
            widths = [4.1] + [2.4 if key == "owner" else 1.8 for _, key in columns[1:]]
        else:
            widths = [5.5] + [(11.9 - 5.5) / (len(columns) - 1)] * (len(columns) - 1)
        labels = {
            "open": "待處理",
            "in_progress": "處理中",
            "resolved": "已解決",
            "closed": "已結案",
            "issue": "議題",
            "risk": "風險",
            "change": "變更",
            "decision": "決策",
            "task": "待辦",
            "milestone": "里程碑",
            "todo": "待辦",
            "doing": "進行中",
            "done": "完成",
            "unknown": "未確認",
            "complete": "檢視完成",
            "question": "有疑問",
            "pass": "通過",
            "fail": "失敗",
            "not_run": "未執行",
            "blocked": "阻塞",
            "low": "低",
            "medium": "中",
            "high": "高",
            "critical": "緊急",
        }

        def value(item, key):
            v = item.get(key)
            if key == "owner" and not v:
                return "未指定"
            if key == "owner" and item.get("owner_alias"):
                v = item["owner_alias"]
            return (
                "待確認"
                if v is None
                else "是"
                if v is True
                else "否"
                if v is False
                else labels.get(str(v), str(v))
            )

        pages, heights, page, page_heights, used = [], [], [], [], 0.5
        for item in rows:
            lines = max(
                sum(
                    max(
                        1,
                        math.ceil(
                            sum(1 if ord(c) > 127 else 0.6 for c in line) / max(1, (widths[i] - 0.2) / 0.21)
                        ),
                    )
                    for line in value(item, key).split("\n")
                )
                for i, (_, key) in enumerate(columns)
            )
            height = max(0.5, lines * 0.25 + 0.12)
            if page and used + height > 4.8:
                pages.append(page)
                heights.append(page_heights)
                page, page_heights, used = [], [], 0.5
            page.append(item)
            page_heights.append(height)
            used += height
        pages.append(page)
        heights.append(page_heights)
        for idx, page in enumerate(pages):
            s = slide(title + (f" ({idx + 1}/{len(pages)})" if len(pages) > 1 else ""))
            if not page:
                text(s, "此報告期間沒有相關紀錄", 0.7, 1.7, 11.8, 1)
                continue
            t = s.shapes.add_table(
                len(page) + 1,
                len(columns),
                Inches(0.7),
                Inches(1.7),
                Inches(11.9),
                Inches(0.5 + sum(heights[idx])),
            ).table
            t.rows[0].height = Inches(0.5)
            for row, height in enumerate(heights[idx], 1):
                t.rows[row].height = Inches(height)
            for col, (label, key) in enumerate(columns):
                t.columns[col].width = Inches(widths[col])
                t.cell(0, col).text = label
                for row, item in enumerate(page, 1):
                    t.cell(row, col).text = value(item, key)
            for row in t.rows:
                for cell in row.cells:
                    for p in cell.text_frame.paragraphs:
                        p.font.size, p.font.name = Pt(15), "Microsoft JhengHei"

    s = slide(snapshot.get("title") or "專案進度報告")
    text(s, clipped(snapshot["project"]["name"], 21), 0.7, 2, 11.7, 1, 38, teal)
    s.notes_slide.notes_text_frame.text += "\n" + snapshot["project"]["name"]
    summary_text = snapshot["project"].get("summary", "") or "尚未填寫專案摘要"
    text(s, clipped(summary_text, 150), 0.7, 3.2, 11.7, 2, 22)
    text(s, "對外版" if snapshot["external"] else "內部管理版", 0.7, 6.2, 11, 0.5, 16)
    if len(summary_text) > 150:
        for begin in range(0, len(summary_text), 450):
            s = slide("專案摘要")
            text(s, summary_text[begin : begin + 450], 0.7, 1.7, 11.7, 4.8, 20)
    if "effort" in sections and not snapshot["external"]:
        summary = snapshot["summary"]
        s = slide("資源投入與成本")
        text(
            s,
            f"累計工時  {summary['hours']} 小時\n預計完成成本  {summary['eac'] or '待估'}\n"
            f"全期已投入成本  {summary['actual_cost'] or '待估'}\n剩餘成本  {summary.get('etc') or '待估'}\n"
            f"預估餘額  {summary['profit'] or '待估'}\n"
            f"缺少成本單價  {summary['missing_rate_rows']} 筆",
            0.7,
            1.6,
            4,
            3.7,
            20,
        )
        if summary["monthly"]:
            data = CategoryChartData()
            data.categories = [r["name"] for r in summary["monthly"]]
            data.add_series("工時", [r["hours"] for r in summary["monthly"]])
            s.shapes.add_chart(
                XL_CHART_TYPE.COLUMN_CLUSTERED, Inches(5), Inches(1.7), Inches(7.4), Inches(4.6), data
            )
    if "issues" in sections:
        issue_timeline(snapshot["issues"])
        table(
            "議題與決策",
            [("事項編號", "number"), ("事項", "title"), ("類型", "kind"), ("優先級", "priority"), ("狀態", "status")]
            if snapshot["external"] else
            [("事項編號", "number"), ("事項", "title"), ("負責人", "owner"), ("類型", "kind"), ("優先級", "priority"), ("狀態", "status")],
            snapshot["issues"],
        )
    if "works" in sections:
        table(
            "待辦與里程碑",
            [("工作", "title"), ("類型", "kind"), ("期限", "due"), ("狀態", "status")]
            if snapshot["external"] else
            [("工作", "title"), ("負責人", "owner"), ("類型", "kind"), ("期限", "due"), ("狀態", "status")],
            snapshot["works"],
        )
    if "deliverables" in sections:
        table(
            "交付與查核",
            [("交付", "title"), ("初步檢視", "review"), ("需查核", "applicable"), ("正式結果", "result")]
            if snapshot["external"] else
            [("交付", "title"), ("負責人", "owner"), ("初步檢視", "review"), ("需查核", "applicable"), ("正式結果", "result")],
            snapshot["deliverables"],
        )
    if "scenario" in sections and snapshot.get("scenario") and not snapshot["external"]:
        v = snapshot["scenario"]
        s = slide("變更情境")
        text(
            s,
            f"{v['name']} ({v['status']})\n修訂收入：{v['revised_revenue'] or '待估'}\n"
            f"淨收入減少：{v['net_revenue_decrease'] or '待估'}\n"
            f"修訂完工成本：{v['revised_eac'] or '待估'}",
            0.7,
            1.7,
            11.7,
            4.5,
            26,
        )
    stream = io.BytesIO()
    prs.save(stream)
    return stream.getvalue()
