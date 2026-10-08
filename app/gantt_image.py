"""Render a fixed-layout issue Gantt chart for PowerPoint slides."""

import io
from datetime import date, datetime, timedelta
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 2380, 1080
COLORS = {
    "open": "#94a3ad",
    "in_progress": "#4779b5",
    "resolved": "#469470",
    "closed": "#53636c",
}
STATUS_NAMES = {
    "open": "待處理",
    "in_progress": "處理中",
    "resolved": "已解決",
    "closed": "已結案",
}
FONT_PATHS = (
    Path("C:/Windows/Fonts/msjh.ttc"),
    Path("/System/Library/Fonts/PingFang.ttc"),
    Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
    Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
    Path("/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"),
)


def _font(size):
    for path in FONT_PATHS:
        if path.is_file():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default(size=size)


def _fit(draw, value, font, width):
    value = str(value)
    if draw.textlength(value, font=font) <= width:
        return value
    while value and draw.textlength(value + "…", font=font) > width:
        value = value[:-1]
    return value + "…" if value else "…"


def _segments(row, start, end):
    history = row.get("status_history") or [{"at": row.get("created", ""), "status": row.get("status", "open")}]
    events = []
    for event in history:
        day = str(event.get("at") or row.get("created", ""))[:10]
        if day:
            event_day = max(start, datetime.fromisoformat(day).date())
            if event_day <= end:
                events.append((event_day, event.get("status", "open")))
    events.sort(key=lambda item: item[0])
    collapsed = []
    for event in events:
        if collapsed and collapsed[-1][0] == event[0]:
            collapsed[-1] = event
        else:
            collapsed.append(event)
    if not collapsed:
        collapsed = [(start, row.get("status", "open"))]
    elif collapsed[0][0] > start:
        collapsed.insert(0, (start, collapsed[0][1]))
    return [
        (day, min(end + timedelta(days=1), collapsed[index + 1][0])
         if index + 1 < len(collapsed) else end + timedelta(days=1), status)
        for index, (day, status) in enumerate(collapsed)
    ]


def render_issue_gantt(rows, low, high, external=False):
    """Return a PNG with a single coordinate system for legend, dates, and bars."""
    image = Image.new("RGB", (WIDTH, HEIGHT), "white")
    draw = ImageDraw.Draw(image)
    body = _font(24)
    small = _font(21)
    label_font = _font(23)
    owner_font = _font(21)
    muted = "#657782"
    navy = "#182636"
    light = "#edf1f3"
    low_day, high_day = date.fromisoformat(low), date.fromisoformat(high)
    span = max(1, (high_day - low_day).days + 1)
    owner_width = max((draw.textlength(
        row.get("owner_display") or row.get("owner_alias") or row.get("owner") or "", font=owner_font,
    ) for row in rows), default=0) if not external else 0
    chart_left = 620
    chart_right = min(2100, max(1580, int(WIDTH - 40 - owner_width - 36)))
    chart_width = chart_right - chart_left
    row_top, row_height = 220, 92
    row_bottom = row_top + len(rows) * row_height

    for index, (status, color) in enumerate(COLORS.items()):
        x = 20 + index * 190
        draw.rounded_rectangle((x, 28, x + 24, 52), radius=3, fill=color)
        draw.text((x + 34, 40), STATUS_NAMES[status], font=body, fill=navy, anchor="lm")
    draw.text((chart_left, 104), f"{low} — {high}", font=body, fill=navy, anchor="lm")

    offsets = sorted({round((span - 1) * fraction / 4) for fraction in range(5)})
    for offset in offsets:
        x = chart_left + offset / span * chart_width
        day = (low_day + timedelta(days=offset)).isoformat()
        label_x = max(chart_left + 55, min(chart_right - 55, x))
        draw.text((label_x, 159), day, font=small, fill=muted, anchor="mm")
        draw.line((x, 184, x, row_bottom + 9), fill="#e4eaed", width=2)
        draw.text((label_x, row_bottom + 48), day, font=small, fill=muted, anchor="mm")
    draw.line((chart_left, 187, chart_right, 187), fill="#d4dee3", width=2)
    draw.line((chart_left, row_bottom + 9, chart_right, row_bottom + 9), fill="#d4dee3", width=2)

    for index, row in enumerate(rows):
        y = row_top + index * row_height
        number = row.get("number") or ""
        title = row.get("title") or ""
        if number:
            draw.text((20, y + 22), _fit(draw, number, body, 550), font=body, fill=navy, anchor="lm")
            draw.text((20, y + 56), _fit(draw, title, label_font, 550), font=label_font, fill=muted, anchor="lm")
        else:
            draw.text((20, y + 45), _fit(draw, title, label_font, 550), font=label_font, fill=navy, anchor="lm")
        draw.line((20, y + 84, WIDTH - 20, y + 84), fill="#f0f3f4", width=2)
        created, due = str(row.get("created") or "")[:10], row.get("due")
        owner = row.get("owner_display") or row.get("owner_alias") or row.get("owner") or "未指定"
        if not created or not due:
            schedule = "未設定期限" if not due else "未設定建立日"
            if not external:
                schedule += f" · 負責人：{owner}"
            draw.text((chart_left + 10, y + 45), _fit(draw, schedule, small, WIDTH - chart_left - 40),
                      font=small, fill=muted, anchor="lm")
            continue
        start = date.fromisoformat(created)
        end = max(start, date.fromisoformat(due))
        x0 = chart_left + max(0, (start - low_day).days) / span * chart_width
        x1 = chart_left + (end - low_day).days / span * chart_width + chart_width / span
        bar_top, bar_bottom = y + 30, y + 59
        draw.rounded_rectangle((x0, bar_top, x1, bar_bottom), radius=4, fill=light)
        segments = _segments(row, start, end)
        for segment_start, segment_end, status in segments:
            sx = chart_left + (segment_start - low_day).days / span * chart_width
            ex = chart_left + (segment_end - low_day).days / span * chart_width
            if ex > sx:
                draw.rectangle((sx, bar_top, ex, bar_bottom), fill=COLORS.get(status, COLORS["open"]))
        if not external and owner:
            latest_start = segments[-1][0]
            label_x = chart_left + (latest_start - low_day).days / span * chart_width + 6
            shown = _fit(draw, owner, owner_font, WIDTH - label_x - 24)
            text_width = draw.textlength(shown, font=owner_font)
            draw.rounded_rectangle((label_x - 1, bar_top + 2, label_x + text_width + 10, bar_bottom - 2),
                                   radius=3, fill="#fdfefe")
            draw.text((label_x + 4, y + 45), shown, font=owner_font, fill=navy, anchor="lm")

    stream = io.BytesIO()
    image.save(stream, format="PNG")
    return stream.getvalue()
