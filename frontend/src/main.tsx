import React, { useEffect, useState, useRef, useMemo } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  FolderKanban,
  Clock3,
  CircleAlert,
  Upload,
  FileChartColumn,
  Plus,
  X,
  ArrowUpRight,
  Download,
  Settings2,
  ShieldCheck,
  ChevronRight,
  Check,
  Search,
  Archive,
  RefreshCw,
  Menu,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import "./styles.css";

type Row = Record<string, any>;
const isString = (value: unknown): value is string => typeof value === "string";
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";
const isSortDirection = (value: unknown): value is "asc" | "desc" => value === "asc" || value === "desc";
const isPositiveInteger = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value > 0;

function useSavedListState<T>(key: string, defaultValue: T, isValid: (value: unknown) => value is T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = window.localStorage.getItem(key);
      if (saved !== null) {
        const parsed: unknown = JSON.parse(saved);
        if (isValid(parsed)) return parsed;
      }
    } catch { /* Storage may be unavailable or contain stale data. */ }
    return defaultValue;
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, JSON.stringify(value)); }
    catch { /* Keep the current page usable when storage is unavailable. */ }
  }, [key, value]);
  return [value, setValue] as const;
}

type Field = {
  key: string;
  label: string;
  type?: string;
  options?: string[];
  required?: boolean;
};
let csrf = "";
async function api(path: string, method = "GET", data?: any) {
  const options: RequestInit = { method, headers: { "x-csrf-token": csrf } };
  if (data instanceof FormData) options.body = data;
  else if (data !== undefined) {
    (options.headers as any)["Content-Type"] = "application/json";
    options.body = JSON.stringify(data);
  }
  const res = await fetch("/api" + path, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: "無法完成請求" }));
    throw new Error(body.detail || "請求失敗");
  }
  return res.json();
}
const labels: Row = {
  planning: "規劃中",
  active: "進行中",
  at_risk: "需關注",
  paused: "暫停",
  completed: "已完成",
  open: "待處理",
  in_progress: "處理中",
  resolved: "已解決",
  closed: "已結案",
  issue: "議題",
  risk: "風險",
  change: "變更",
  decision: "決策",
  low: "低",
  medium: "中",
  high: "高",
  critical: "緊急",
  todo: "待辦",
  doing: "進行中",
  done: "完成",
  task: "待辦",
  milestone: "里程碑",
  cost: "成本",
  sale: "售價",
  hour: "小時",
  day: "人天",
  unknown: "未確認",
  complete: "檢視完成",
  question: "有疑問",
  not_run: "未執行",
  pass: "通過",
  fail: "失敗",
  blocked: "阻塞",
  inclusive: "含稅",
  exclusive: "未稅",
  draft: "草案",
  approved: "已核定",
  rejected: "未採用",
};
const name = (v: any) => labels[v] || v || "—";
const personDisplay = (person: any, alias: any) =>
  alias ? String(alias) : String(person || "");
const ownerDisplay = (row: Row) => personDisplay(row.owner, row.owner_alias);
const ownerFilterKey = (row: Row) => row.owner_member_id
  ? `member:${row.owner_member_id}` : `legacy:${row.owner}`;
const num = (v: any) =>
  v === null || v === undefined || v === ""
    ? "待估"
    : Number(v).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
const icons = [
  LayoutDashboard,
  FolderKanban,
  Clock3,
  CircleAlert,
  Upload,
  FileChartColumn,
];
const nav = [
  "專案總覽",
  "專案管理",
  "工時與成本",
  "事項追蹤",
  "資料匯入",
  "報告中心",
];
const colors = [
  "#16877d",
  "#5c80ad",
  "#d6a154",
  "#a19ab9",
  "#91b9ad",
  "#71818e",
];
const schemas: Record<string, Field[]> = {
  projects: [
    { key: "name", label: "專案名稱", required: true },
    { key: "code", label: "專案編號", required: true },
    { key: "client", label: "客戶／機關" },
    { key: "owner", label: "負責人" },
    {
      key: "status",
      label: "狀態",
      options: ["planning", "active", "at_risk", "paused", "completed"],
    },
    { key: "status_reason", label: "狀態理由", type: "textarea" },
    { key: "summary", label: "專案摘要", type: "textarea" },
    { key: "start", label: "開始日期", type: "date" },
    { key: "end", label: "結束日期", type: "date" },
    { key: "currency", label: "幣別" },
    { key: "hours_per_day", label: "1 MD 標準工時", type: "number" },
    {
      key: "tax_basis",
      label: "金額口徑",
      options: ["", "inclusive", "exclusive"],
      required: true,
    },
    { key: "budget", label: "成本預算", type: "number" },
    { key: "revenue", label: "核定收入", type: "number" },
    { key: "eac", label: "預計完成成本 EAC", type: "number" },
    { key: "budget_start", label: "預算範圍起日（空白＝全期）", type: "date" },
    { key: "budget_end", label: "預算範圍迄日", type: "date" },
  ],
  roles: [
    { key: "name", label: "工時角色名稱", required: true },
    { key: "active", label: "狀態", options: ["true", "false"] },
  ],
  members: [
    { key: "person", label: "成員姓名", required: true },
    { key: "alias", label: "英文名／別名" },
    { key: "role", label: "預設工時角色" },
    { key: "active", label: "狀態", options: ["true", "false"] },
  ],
  times: [
    { key: "person", label: "人員", required: true },
    { key: "date", label: "工作日期", type: "date", required: true },
    { key: "hours", label: "工時（小時）", type: "number", required: true },
    { key: "role", label: "角色" },
    { key: "category", label: "工作分類" },
    { key: "content", label: "工作內容", type: "textarea" },
    { key: "progress", label: "進度說明", type: "textarea" },
  ],
  rates: [
    { key: "role", label: "角色", required: true },
    { key: "person", label: "適用人員（空白＝該角色）" },
    { key: "purpose", label: "用途", options: ["cost", "sale"] },
    { key: "amount", label: "單價", type: "number", required: true },
    { key: "unit", label: "單位", options: ["hour", "day"] },
    { key: "start", label: "有效起日", type: "date", required: true },
    { key: "end", label: "有效迄日", type: "date" },
  ],
  issues: [
    { key: "title", label: "標題", required: true },
    {
      key: "kind",
      label: "類型",
      options: ["issue", "risk", "change", "decision"],
    },
    { key: "owner", label: "負責人" },
    {
      key: "priority",
      label: "優先級",
      options: ["low", "medium", "high", "critical"],
    },
    {
      key: "status",
      label: "狀態",
      options: ["open", "in_progress", "resolved", "closed"],
    },
    { key: "due", label: "期限", type: "date" },
    { key: "description", label: "說明／影響", type: "textarea" },
    { key: "action", label: "處置行動", type: "textarea" },
    { key: "decision", label: "決策結論", type: "textarea" },
    { key: "external_url", label: "外部追蹤連結（HTTP／HTTPS）" },
  ],
  works: [
    { key: "title", label: "工作名稱", required: true },
    { key: "kind", label: "類型", options: ["task", "milestone"] },
    { key: "owner", label: "負責人" },
    { key: "due", label: "期限", type: "date" },
    { key: "status", label: "狀態", options: ["todo", "doing", "done"] },
  ],
  deliverables: [
    { key: "title", label: "交付／功能名稱", required: true },
    { key: "code", label: "識別碼" },
    { key: "system", label: "系統／分類" },
    { key: "description", label: "需求說明", type: "textarea" },
    { key: "control_ref", label: "控管參照" },
    { key: "owner", label: "負責人" },
    { key: "due", label: "期限", type: "date" },
    {
      key: "review",
      label: "初步檢視",
      options: ["unknown", "complete", "question"],
    },
    {
      key: "applicable",
      label: "需正式查核",
      options: ["unset", "true", "false"],
    },
    { key: "applicability_reason", label: "適用性理由" },
    {
      key: "result",
      label: "正式結果",
      options: ["unknown", "not_run", "pass", "fail", "blocked"],
    },
    { key: "checked_on", label: "正式查核日期", type: "date" },
    { key: "notes", label: "問題／結論", type: "textarea" },
    { key: "evidence", label: "證據參照（文字或連結）" },
  ],
  payments: [
    { key: "title", label: "款項名稱", required: true },
    { key: "amount", label: "約定金額", type: "number", required: true },
    { key: "due", label: "預定日期", type: "date" },
    { key: "invoiced", label: "已開票", type: "number" },
    { key: "received", label: "已收款", type: "number" },
  ],
};
const multilineFields = new Set(Object.values(schemas)
  .flatMap((fields) => fields.filter((field) => field.type === "textarea").map((field) => field.key)));
const defaults: Row = {
  projects: {
    status: "active",
    currency: "TWD",
    tax_basis: "",
    other_cost: "0",
  },
  roles: { active: true },
  members: { active: true },
  rates: {
    purpose: "cost",
    unit: "day",
    start: "2000-01-01",
  },
  issues: { kind: "issue", priority: "medium", status: "open" },
  works: { kind: "task", status: "todo" },
  deliverables: { review: "unknown", result: "unknown", applicable: "unset" },
  payments: { invoiced: "0", received: "0" },
};

function Badge({ value }: { value: any }) {
  return <span className={"badge " + value}>{name(value)}</span>;
}
function Empty({
  text = "尚無資料",
  action,
}: {
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <FolderKanban size={34} />
      <h3>{text}</h3>
      <p>新增或匯入資料，即可開始追蹤專案。</p>
      {action}
    </div>
  );
}
function ChartBox({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h3>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
function DataTable({
  rows,
  columns,
  onEdit,
  sortKey,
  sortDirection,
  onSort,
}: {
  rows: Row[];
  columns: [string, string][];
  onEdit?: (r: Row) => void;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string) => void;
}) {
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map(([k, l]) => (
              <th
                key={k}
                aria-sort={
                  onSort && sortKey === k
                    ? sortDirection === "asc"
                      ? "ascending"
                      : "descending"
                    : undefined
                }
              >
                {onSort ? (
                  <button
                    className="table-sort"
                    onClick={() => onSort(k)}
                    aria-label={`${l}排序${sortKey === k ? (sortDirection === "asc" ? "，目前遞增" : "，目前遞減") : ""}`}
                  >
                    {l}
                    <span aria-hidden="true">
                      {sortKey === k ? (sortDirection === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                ) : (
                  l
                )}
              </th>
            ))}
            {onEdit && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              {columns.map(([k]) => (
                <td key={k} className={multilineFields.has(k) ? "preserve-line-breaks" : undefined}>
                  {[
                    "status",
                    "priority",
                    "kind",
                    "purpose",
                    "review",
                    "result",
                  ].includes(k) ? (
                    <Badge value={r[k]} />
                  ) : k === "owner" && r[k] ? (
                    <>{ownerDisplay(r)} {!r.owner_member_id && <small className="legacy-owner">待重新指派</small>}</>
                  ) : k === "person" && r[k] ? (
                    personDisplay(r[k], r.person_alias)
                  ) : r[k] === true ? (
                    "是"
                  ) : r[k] === false ? (
                    "否"
                  ) : (
                    String(r[k] ?? "—")
                  )}
                </td>
              ))}
              {onEdit && (
                <td>
                  <button className="link" onClick={() => onEdit(r)}>
                    編輯
                    <ChevronRight size={14} />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <Empty />
  );
}

const issueTimelineColors: Row = {
  open: "#94a3ad",
  in_progress: "#4779b5",
  resolved: "#55a486",
  closed: "#53636c",
};
const issueTimelineStatusNames: Row = {
  open: "待處理",
  in_progress: "處理中",
  resolved: "已解決",
  closed: "已結案",
};
function sameIssueOwner(a: Row, b: Row) {
  if (a.owner_member_id && b.owner_member_id) return a.owner_member_id === b.owner_member_id;
  return String(a.owner || "").trim() === String(b.owner || "").trim();
}
function IssueTimeline({ rows }: { rows: Row[] }) {
  const dated = rows.filter((row) => row.created && row.due);
  const dates = dated.flatMap((row) => {
    const start = row.created.slice(0, 10);
    return [start, row.due > start ? row.due : start];
  });
  if (!rows.length) return null;
  const low = dates.length ? dates.reduce((a, b) => a < b ? a : b) : "";
  const high = dates.length ? dates.reduce((a, b) => a > b ? a : b) : "";
  const dayNumber = (value: string) => Math.floor(Date.parse(`${value}T00:00:00Z`) / 86400000);
  const firstDay = low ? dayNumber(low) : 0;
  const rangeDays = low ? Math.max(1, dayNumber(high) - firstDay + 1) : 1;
  const ticks = low ? [...new Set([0, 0.25, 0.5, 0.75, 1].map(
    (fraction) => Math.round(rangeDays * fraction),
  ))].map((offset) => ({
    label: new Date((firstDay + offset) * 86400000).toISOString().slice(0, 10),
    position: `${offset / rangeDays * 100}%`,
  })) : [];
  return (
    <section className="panel issue-timeline-panel">
      <div className="panel-head">
        <div><h3>事項追蹤甘特圖</h3><span className="muted">依查詢結果與排序排列；左側顯示目前負責人，橫條按狀態變更時間分段並標示歷次負責人</span></div>
      </div>
      <div className="timeline-legend">
        {Object.keys(issueTimelineColors).map((status) => <span key={status}>
          <i style={{ background: issueTimelineColors[status] }} />{issueTimelineStatusNames[status]}
        </span>)}
      </div>
      <div className="issue-timeline-scroll">
        <div className="issue-timeline" style={{ minWidth: `${Math.max(700, rangeDays * 4)}px` }}>
          <div className="timeline-axis"><div />
            <div className="timeline-axis-dates">{ticks.length ? ticks.map((tick, i) => <span key={i} style={{ left: tick.position }}>{tick.label}</span>) : <span>尚無可排程日期</span>}</div>
          </div>
          {rows.map((row) => {
            const start = row.created?.slice(0, 10);
            const due = row.due;
            const owner = row.owner_alias || row.owner || "未指定";
            if (!start || !due) return <div className="timeline-row" key={row.id}>
              <div className="timeline-item-label"><strong>{[row.number, row.title].filter(Boolean).join(" ")}</strong><small>負責人：{owner}</small></div>
              <div className="timeline-track"><span className="timeline-unscheduled">{!due ? "未設定期限" : "未設定建立日"}</span></div>
            </div>;
            const startDay = dayNumber(start);
            const endDay = Math.max(startDay, dayNumber(due));
            const history = row.status_history?.length
              ? row.status_history
              : [{ at: row.created, status: row.status, owner: row.owner, owner_alias: row.owner_alias }];
            const events = history.map((event: Row, index: number) => ({
              day: Math.max(startDay, dayNumber(String(event.at || row.created).slice(0, 10))), event, index,
            })).filter((item: Row) => item.day <= endDay)
              .sort((a: Row, b: Row) => a.day - b.day || a.index - b.index)
              .reduce((acc: Row[], current: Row) => {
                if (acc.length && acc[acc.length - 1].day === current.day) acc[acc.length - 1] = current;
                else acc.push(current);
                return acc;
              }, []);
            if (!events.length) events.push({
              day: startDay, event: { at: row.created, status: row.status, owner: row.owner, owner_alias: row.owner_alias },
            });
            return <div className="timeline-row" key={row.id}>
              <div className="timeline-item-label"><strong>{[row.number, row.title].filter(Boolean).join(" ")}</strong><small>負責人：{owner}</small></div>
              <div className="timeline-track" title={`${start} — ${due}`}>
                {events.map((item: Row, index: number) => {
                  const end = Math.min(events[index + 1]?.day ?? endDay + 1, endDay + 1);
                  const left = (item.day - firstDay) / rangeDays * 100;
                  const width = (end - item.day) / rangeDays * 100;
                  const eventOwner = item.event.owner_alias || item.event.owner || "未指定";
                  const ownerChanged = index === 0 || !sameIssueOwner(item.event, events[index - 1].event);
                  const hasLaterOwnerChange = events.slice(index + 1).some((next: Row) =>
                    !sameIssueOwner(next.event, item.event));
                  const showHistoricalOwner = ownerChanged &&
                    (!sameIssueOwner(item.event, row) || hasLaterOwnerChange);
                  const eventStatus = issueTimelineStatusNames[item.event.status] || "待處理";
                  const eventDate = new Date(item.event.at).toLocaleDateString("sv-SE");
                  return <span key={`${item.day}-${index}`} className="timeline-segment"
                    style={{ left: `${left}%`, width: `${width}%`, background: issueTimelineColors[item.event.status] || issueTimelineColors.open }}
                    title={`${eventStatus} · ${eventOwner} · ${eventDate}`}>
                    {showHistoricalOwner ? eventOwner : ""}
                  </span>;
                })}
              </div>
            </div>;
          })}
          <div className="timeline-axis timeline-axis-bottom"><div />
            <div className="timeline-axis-dates">{ticks.map((tick, i) => <span key={i} style={{ left: tick.position }}>{tick.label}</span>)}</div>
          </div>
        </div>
      </div>
    </section>
  );
}

const timeColumns: [string, string][] = [
  ["date", "日期"],
  ["person", "人員"],
  ["role", "角色"],
  ["category", "分類"],
  ["hours", "小時"],
  ["content", "工作內容"],
];

function TimeRecordsTable({ rows, onEdit, projectId }: { rows: Row[]; onEdit: (r: Row) => void; projectId: string }) {
  const savedKey = (field: string) => `pm-site:list:times:${projectId}:${field}`;
  const [dateFrom, setDateFrom] = useSavedListState(savedKey("dateFrom"), "", isString);
  const [dateTo, setDateTo] = useSavedListState(savedKey("dateTo"), "", isString);
  const [person, setPerson] = useSavedListState(savedKey("person"), "", isString);
  const [role, setRole] = useSavedListState(savedKey("role"), "", isString);
  const [category, setCategory] = useSavedListState(savedKey("category"), "", isString);
  const [minHours, setMinHours] = useSavedListState(savedKey("minHours"), "", isString);
  const [maxHours, setMaxHours] = useSavedListState(savedKey("maxHours"), "", isString);
  const [content, setContent] = useSavedListState(savedKey("content"), "", isString);
  const [sortKey, setSortKey] = useSavedListState(savedKey("sortKey"), "date", (value): value is string =>
    isString(value) && timeColumns.some(([key]) => key === value));
  const [sortDirection, setSortDirection] = useSavedListState(savedKey("sortDirection"), "desc" as "asc" | "desc", isSortDirection);
  const [page, setPage] = useSavedListState(savedKey("page"), 1, isPositiveInteger);
  const [pageSize, setPageSize] = useSavedListState(savedKey("pageSize"), 20, (value): value is number =>
    value === 20 || value === 50 || value === 100);
  const options = (key: string) => [...new Set(rows.map((row) => String(row[key] || "")))].filter(Boolean).sort((a, b) => a.localeCompare(b, "zh-TW"));
  const filtered = useMemo(() => {
    const matches = rows.filter((row) =>
      (!dateFrom || row.date >= dateFrom) &&
      (!dateTo || row.date <= dateTo) &&
      (!person || row.person === person) &&
      (!role || (role === "__missing__" ? !row.role : row.role === role)) &&
      (!category || row.category === category) &&
      (minHours === "" || Number(row.hours) >= Number(minHours)) &&
      (maxHours === "" || Number(row.hours) <= Number(maxHours)) &&
      (!content || String(row.content || "").toLocaleLowerCase().includes(content.toLocaleLowerCase()))
    );
    return matches.sort((a, b) => {
      const result = sortKey === "hours"
        ? Number(a.hours) - Number(b.hours)
        : String(a[sortKey] || "").localeCompare(String(b[sortKey] || ""), "zh-TW", { numeric: true });
      return sortDirection === "asc" ? result : -result;
    });
  }, [rows, dateFrom, dateTo, person, role, category, minHours, maxHours, content, sortKey, sortDirection]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const first = (currentPage - 1) * pageSize;
  const displayed = filtered.slice(first, first + pageSize);
  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  const clearFilters = () => {
    setDateFrom(""); setDateTo(""); setPerson(""); setRole("");
    setCategory(""); setMinHours(""); setMaxHours(""); setContent("");
    setPage(1);
  };
  const sort = (key: string) => {
    if (sortKey === key) setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection(key === "date" ? "desc" : "asc"); }
    setPage(1);
  };
  return (
    <>
      <div className="time-filters">
        <label>日期起<input type="date" value={dateFrom} onChange={(e) => updateFilter(setDateFrom, e.target.value)} /></label>
        <label>日期迄<input type="date" value={dateTo} onChange={(e) => updateFilter(setDateTo, e.target.value)} /></label>
        <label>人員<select value={person} onChange={(e) => updateFilter(setPerson, e.target.value)}>
          <option value="">全部人員</option>{options("person").map((value) =>
            <option key={value} value={value}>{personDisplay(value, rows.find((row) => row.person === value)?.person_alias)}</option>)}
        </select></label>
        <label>角色<select value={role} onChange={(e) => updateFilter(setRole, e.target.value)}>
          <option value="">全部角色</option><option value="__missing__">未指定</option>
          {options("role").map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label>分類<select value={category} onChange={(e) => updateFilter(setCategory, e.target.value)}>
          <option value="">全部分類</option>{options("category").map((value) => <option key={value}>{value}</option>)}
        </select></label>
        <label>小時至少<input type="number" min="0" step="0.01" value={minHours} onChange={(e) => updateFilter(setMinHours, e.target.value)} /></label>
        <label>小時至多<input type="number" min="0" step="0.01" value={maxHours} onChange={(e) => updateFilter(setMaxHours, e.target.value)} /></label>
        <label>工作內容<input type="search" placeholder="搜尋內容" value={content} onChange={(e) => updateFilter(setContent, e.target.value)} /></label>
        <button className="ghost" onClick={clearFilters}>清除篩選</button>
      </div>
      {filtered.length ? (
        <DataTable rows={displayed} columns={timeColumns} onEdit={onEdit} sortKey={sortKey} sortDirection={sortDirection} onSort={sort} />
      ) : <div className="time-no-results">{rows.length ? "沒有符合篩選的工時紀錄" : "尚無工時紀錄"}</div>}
      <div className="time-pagination">
        <span>共 {filtered.length} 筆 · 顯示 {filtered.length ? first + 1 : 0}–{Math.min(first + pageSize, filtered.length)} 筆</span>
        <div className="time-page-controls">
          <label>每頁 <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {[20, 50, 100].map((size) => <option key={size} value={size}>{size} 筆</option>)}
          </select></label>
          <button className="secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一頁</button>
          <span>第 {currentPage} / {pageCount} 頁</span>
          <button className="secondary" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>下一頁</button>
        </div>
      </div>
    </>
  );
}

const issueColumns: [string, string][] = [
  ["number", "事項編號"],
  ["title", "事項"],
  ["kind", "類型"],
  ["priority", "優先級"],
  ["owner", "負責人"],
  ["due", "期限"],
  ["status", "狀態"],
  ["action", "處置行動"],
];

const issueStatuses = ["open", "in_progress", "resolved", "closed"];

function IssueRecordsTable({ rows, onEdit, projectId }: { rows: Row[]; onEdit: (r: Row) => void; projectId: string }) {
  const savedKey = (field: string) => `pm-site:list:issues:${projectId}:${field}`;
  const [search, setSearch] = useSavedListState(savedKey("search"), "", isString);
  const [statuses, setStatuses] = useSavedListState(savedKey("statuses"), issueStatuses, (value): value is string[] =>
    Array.isArray(value) && value.every((status) => issueStatuses.includes(status)));
  const [kind, setKind] = useSavedListState(savedKey("kind"), "", isString);
  const [priority, setPriority] = useSavedListState(savedKey("priority"), "", isString);
  const [owner, setOwner] = useSavedListState(savedKey("owner"), "", isString);
  const [dueFrom, setDueFrom] = useSavedListState(savedKey("dueFrom"), "", isString);
  const [dueTo, setDueTo] = useSavedListState(savedKey("dueTo"), "", isString);
  const [sortKey, setSortKey] = useSavedListState(savedKey("sortKey"), "due", (value): value is string =>
    isString(value) && issueColumns.some(([key]) => key === value));
  const [sortDirection, setSortDirection] = useSavedListState(savedKey("sortDirection"), "asc" as "asc" | "desc", isSortDirection);
  const ownerOptions = [...new Map(rows.filter((row) => row.owner).map((row) => [
    ownerFilterKey(row), {
      value: ownerFilterKey(row),
      label: `${ownerDisplay(row)}${row.owner_member_id ? "" : "（待重新指派）"}`,
    },
  ])).values()].sort((a, b) => a.label.localeCompare(b.label, "zh-TW"));
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("zh-TW");
    const priorityOrder: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
    const statusOrder: Record<string, number> = { open: 0, in_progress: 1, resolved: 2, closed: 3 };
    const matches = rows.filter((row) =>
      statuses.includes(row.status) &&
      (!kind || row.kind === kind) &&
      (!priority || row.priority === priority) &&
      (!owner || (owner === "__missing__" ? !row.owner : ownerFilterKey(row) === owner)) &&
      (!dueFrom || (row.due && row.due >= dueFrom)) &&
      (!dueTo || (row.due && row.due <= dueTo)) &&
      (!query || [row.number, row.title, ownerDisplay(row), row.description, row.action, row.decision]
        .some((value) => String(value || "").toLocaleLowerCase("zh-TW").includes(query)))
    );
    return matches.sort((a, b) => {
      const left = String(sortKey === "owner" ? ownerDisplay(a) : a[sortKey] ?? "").trim();
      const right = String(sortKey === "owner" ? ownerDisplay(b) : b[sortKey] ?? "").trim();
      if (!left || !right) {
        if (!left && right) return 1;
        if (left && !right) return -1;
      }
      const result = sortKey === "priority"
        ? priorityOrder[left] - priorityOrder[right]
        : sortKey === "status"
          ? statusOrder[left] - statusOrder[right]
          : String(sortKey === "kind" ? name(left) : left)
            .localeCompare(String(sortKey === "kind" ? name(right) : right), "zh-TW", { numeric: true });
      if (result) return sortDirection === "asc" ? result : -result;
      return String(a.id || "").localeCompare(String(b.id || ""));
    });
  }, [rows, search, statuses, kind, priority, owner, dueFrom, dueTo, sortKey, sortDirection]);
  const sort = (key: string) => {
    if (key === sortKey) setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDirection(key === "priority" ? "desc" : "asc");
    }
  };
  const clearFilters = () => {
    setSearch(""); setStatuses(issueStatuses); setKind(""); setPriority("");
    setOwner(""); setDueFrom(""); setDueTo("");
  };
  const toggleStatus = (value: string) => {
    setStatuses((selected) => selected.includes(value)
      ? selected.filter((statusValue) => statusValue !== value)
      : [...selected, value]);
  };
  return (
    <>
    <section className="panel">
      <div className="time-filters issue-filters">
        <label className="issue-search">關鍵字
          <input type="search" placeholder="搜尋標題、負責人或內容" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <fieldset className="issue-status-filter">
          <legend>狀態</legend>
          <div className="issue-status-options">
            {issueStatuses.map((value) => <label key={value}>
              <input type="checkbox" checked={statuses.includes(value)} onChange={() => toggleStatus(value)} />
              {name(value)}
            </label>)}
          </div>
        </fieldset>
        <label>類型<select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="">全部類型</option>
          {["issue", "risk", "change", "decision"].map((value) => <option key={value} value={value}>{name(value)}</option>)}
        </select></label>
        <label>優先級<select value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">全部優先級</option>
          {["critical", "high", "medium", "low"].map((value) => <option key={value} value={value}>{name(value)}</option>)}
        </select></label>
        <label>負責人<select value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">全部負責人</option><option value="__missing__">未指定</option>
          {ownerOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select></label>
        <label>期限起<input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} /></label>
        <label>期限迄<input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} /></label>
        <button className="ghost" onClick={clearFilters}>清除篩選</button>
      </div>
      <div className="issue-results" aria-live="polite">符合條件 {filtered.length} / {rows.length} 筆</div>
      {filtered.length ? (
        <DataTable rows={filtered} columns={issueColumns} onEdit={onEdit}
          sortKey={sortKey} sortDirection={sortDirection} onSort={sort} />
      ) : (
        <div className="time-no-results">{rows.length ? "沒有符合篩選的事項" : "尚無事項"}</div>
      )}
    </section>
    <IssueTimeline rows={filtered} />
    </>
  );
}

function ProjectPeoplePanel({
  projectId, members, roles, times, rates, onOpen, onBulkRole,
}: {
  projectId: string;
  members: Row[];
  roles: Row[];
  times: Row[];
  rates: Row[];
  onOpen: (kind: string, row?: Row) => void;
  onBulkRole: (member: Row) => void;
}) {
  const roster = new Set(members.map((member) => String(member.person)));
  const legacyPeople = [...new Set(times.map((entry) => String(entry.person || "")).filter(Boolean))]
    .filter((person) => !roster.has(person)).sort((a, b) => a.localeCompare(b, "zh-TW"));
  const registeredRoles = new Set(roles.map((role) => String(role.name)));
  const legacyRoles = [...new Set([
    ...times.map((entry) => String(entry.role || "")),
    ...rates.map((rate) => String(rate.role || "")),
    ...members.map((member) => String(member.role || "")),
  ].filter(Boolean))].filter((role) => !registeredRoles.has(role))
    .sort((a, b) => a.localeCompare(b, "zh-TW"));
  const hoursFor = (person: string) => times
    .filter((entry) => entry.person === person)
    .reduce((sum, entry) => sum + Number(entry.hours || 0), 0);
  const inferredRole = (person: string) => {
    const names = [...new Set(times.filter((entry) => entry.person === person).map((entry) => String(entry.role || "")).filter(Boolean))];
    return names.length === 1 ? names[0] : "";
  };
  const rateListFor = (roleName: string) => {
    const roleRates = rates.filter((rate) => rate.role === roleName)
      .sort((a, b) => String(a.purpose).localeCompare(String(b.purpose)) || String(b.start).localeCompare(String(a.start)));
    return <div className="role-rates">
      {roleRates.length ? roleRates.map((rate) => (
        <div className="role-rate-row" key={rate.id}>
          <span className="rate-purpose">{name(rate.purpose)}</span>
          <span>{rate.person ? personDisplay(rate.person, rate.person_alias) : "角色通用"}</span>
          <strong>{num(rate.amount)}／{name(rate.unit)}</strong>
          <span>{rate.start}－{rate.end || "持續有效"}</span>
          <button className="link" onClick={() => onOpen("rates", rate)}>編輯<ChevronRight size={14} /></button>
        </div>
      )) : <p className="people-empty">尚無單價；成本會顯示待估，直到設定適用的成本單價。</p>}
    </div>;
  };
  return (
    <div className="people-layout">
      <section className="panel">
        <div className="panel-head"><div><h3>專案成員</h3><p className="muted">{members.length} 位已建檔 · {legacyPeople.length} 位待確認</p></div>
          <button className="secondary" onClick={() => onOpen("members")}><Plus size={15} />新增成員</button></div>
        {[...members].sort((a, b) => String(a.person).localeCompare(String(b.person), "zh-TW")).map((member) => (
          <div className="people-row" key={member.id}>
            <div><strong>{member.person}{member.alias && <span className="member-alias">（{member.alias}）</span>}</strong><span>{member.role || "未指定角色"} · {member.active ? "啟用" : "停用"}</span></div>
            <div className="people-meta"><span>{num(hoursFor(member.person))} hr</span>
              <span>{member.role && rates.some((rate) => rate.purpose === "cost" && rate.role === member.role && (!rate.person || rate.person === member.person)) ? "已設定成本單價" : "缺成本單價"}</span></div>
            {member.active && member.role && times.some((entry) => entry.person === member.person && entry.role !== member.role) &&
              <button className="link" onClick={() => onBulkRole(member)}>更正既有工時</button>}
            <button className="link" onClick={() => onOpen("members", member)}>編輯<ChevronRight size={14} /></button>
          </div>
        ))}
        {legacyPeople.map((person) => (
          <div className="people-row legacy" key={person}>
            <div><strong>{person}</strong><span>工時中已有此人 · 尚未建檔</span></div>
            <div className="people-meta"><span>{num(hoursFor(person))} hr</span><span>{inferredRole(person) || "角色待確認"}</span></div>
            <button className="link" onClick={() => onOpen("members", { person, role: inferredRole(person), active: true })}>加入成員<ChevronRight size={14} /></button>
          </div>
        ))}
        {!members.length && !legacyPeople.length && <p className="people-empty">尚無成員。新增成員後，記錄工時時即可選用。</p>}
      </section>
      <section className="panel">
        <div className="panel-head"><div><h3>角色與單價</h3><p className="muted">按角色查看成本與售價，單價可指定人員及有效期間</p></div>
          <div className="people-actions"><a className="link" href={`/api/exports/rates?project_id=${projectId}&fmt=xlsx`}><Download size={15} />單價 Excel</a>
            <button className="secondary" onClick={() => onOpen("roles")}><Plus size={15} />新增角色</button></div></div>
        {[...roles].sort((a, b) => String(a.name).localeCompare(String(b.name), "zh-TW")).map((role) => (
          <div className="role-group" key={role.id}>
            <div className="people-row">
              <div><strong>{role.name}</strong><span>{role.active ? "啟用" : "停用"}</span></div>
              <button className="link" onClick={() => onOpen("rates", { role: role.name })}><Plus size={14} />新增單價</button>
              <button className="link" onClick={() => onOpen("roles", role)}>編輯角色<ChevronRight size={14} /></button>
            </div>
            {rateListFor(role.name)}
          </div>
        ))}
        {legacyRoles.map((role) => (
          <div className="role-group legacy" key={role}>
            <div className="people-row">
              <div><strong>{role}</strong><span>既有工時或單價使用 · 尚未建檔</span></div>
              <button className="link" onClick={() => onOpen("rates", { role })}><Plus size={14} />新增單價</button>
              <button className="link" onClick={() => onOpen("roles", { name: role, active: true })}>加入角色<ChevronRight size={14} /></button>
            </div>
            {rateListFor(role)}
          </div>
        ))}
        {!roles.length && !legacyRoles.length && <p className="people-empty">尚無角色。先新增工時角色，再設定成本單價。</p>}
      </section>
    </div>
  );
}

function RecordModal({
  kind,
  row,
  pid,
  rates,
  members,
  roleNames,
  close,
  saved,
}: {
  kind: string;
  row?: Row;
  pid: string;
  rates: Row[];
  members: Row[];
  roleNames: string[];
  close: () => void;
  saved: () => void;
}) {
  const [form, setForm] = useState<Row>({
    ...defaults[kind],
    ...row,
    ...(kind === "projects" && row?.tax_basis === "unknown" ? { tax_basis: "" } : {}),
    ...(kind !== "projects" ? { project_id: pid } : {}),
  });
  const [costItems, setCostItems] = useState<Row[]>(() => {
    const items = Array.isArray(row?.other_cost_items)
      ? row.other_cost_items.map((item: Row) => ({ ...item }))
      : [];
    const legacyAmount = Number(row?.other_cost || 0);
    if (legacyAmount > 0) {
      items.push({
        title: "既有其他成本（舊版合計）",
        date: "",
        amount: String(legacyAmount),
        note: "原本以單筆合計記錄",
      });
    }
    return items;
  });
  const [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  const isExisting = !!row?.id;
  const costEditorRef = useRef<HTMLElement>(null);
  const roleOptions = roleNames;
  const currentRole = String(form.role || "");
  const memberNames = members.filter((member) => member.active).map((member) => String(member.person));
  const hasOwner = ["projects", "works", "deliverables", "issues"].includes(kind);
  const ownerMembers = kind === "projects" && !isExisting ? [] : members;
  const linkedOwner = ownerMembers.find((member) => member.id === form.owner_member_id);
  const [ownerRole, setOwnerRole] = useState(
    linkedOwner ? linkedOwner.role || "__unassigned__" : "",
  );
  const ownerRoles = [...new Set(ownerMembers
    .filter((member) => member.active || member.id === form.owner_member_id)
    .map((member) => member.role || "__unassigned__"))]
    .sort((a, b) => a.localeCompare(b, "zh-TW"));
  const ownerChoices = ownerMembers.filter((member) =>
    (member.active || member.id === form.owner_member_id) &&
    (member.role || "__unassigned__") === ownerRole
  ).sort((a, b) => String(a.person).localeCompare(String(b.person), "zh-TW"));
  const legacyOwner = isExisting && form.owner && !form.owner_member_id ? String(form.owner) : "";
  const suggestedOwner = legacyOwner && ownerMembers.find((member) =>
    member.active && [member.person, member.alias].some((value) =>
      value && String(value).toLocaleLowerCase() === legacyOwner.toLocaleLowerCase()
    )
  );
  const otherCostTotal = costItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
  function updateCostItem(index: number, key: string, value: string) {
    setCostItems((items) => items.map((item, i) => i === index ? { ...item, [key]: value } : item));
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      const body: Row = {};
      schemas[kind].forEach((f) => {
        let v = form[f.key];
        if (v === undefined) return;
        if (f.type === "date" || f.type === "number") v = v === "" ? null : v;
        if (f.key === "applicable")
          v =
            v === "unset"
              ? null
              : v === "true"
                ? true
                : v === "false"
                  ? false
                  : v;
        if (f.key === "active") v = v === true || v === "true";
        body[f.key] = v;
      });
      if (kind === "projects") {
        body.other_cost = "0";
        body.other_cost_items = costItems.map((item) => ({
          title: item.title,
          date: item.date || null,
          amount: item.amount,
          note: item.note || "",
        }));
      }
      if (hasOwner) {
        body.owner = form.owner || "";
        body.owner_member_id = form.owner_member_id || "";
      }
      if (kind !== "projects") body.project_id = pid;
      if (isExisting) {
        body.version = row.version;
        if (row.source_id) body.source_id = row.source_id;
        if (row.source_marker) body.source_marker = row.source_marker;
      }
      await api(
        "/records/" + kind + (isExisting ? "/" + row!.id : ""),
        isExisting ? "PUT" : "POST",
        body,
      );
      saved();
      close();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!row || !window.confirm("確定刪除此紀錄？操作將保留於本機歷史。"))
      return;
    try {
      await api(`/records/${kind}/${row.id}?version=${row.version}`, "DELETE");
      saved();
      close();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="編輯紀錄"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <h2>
            {isExisting ? "編輯" : "新增"}
            {
              (
                {
                  projects: "專案",
                  roles: "工時角色",
                  members: "專案成員",
                  times: "工時",
                  rates: "單價",
                  issues: "事項",
                  works: "待辦／里程碑",
                  deliverables: "交付／查核",
                  payments: "款項",
                } as Row
              )[kind]
            }
          </h2>
          <button className="icon-button" onClick={close} aria-label="關閉">
            <X />
          </button>
        </div>
        <form onSubmit={submit}>
          {kind === "projects" && (
            <button
              type="button"
              className="other-cost-shortcut"
              onClick={() => costEditorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              <span>已投入其他成本 · 可輸入多筆</span>
              <strong>{costItems.length} 筆 · {num(otherCostTotal)} {form.currency || "TWD"}</strong>
              <span>編輯明細 ↓</span>
            </button>
          )}
          <div className="form-grid">
            {schemas[kind].map((f) => (
              <label
                className={f.type === "textarea" ? "wide" : ""}
                key={f.key}
              >
                {f.label}
                {f.required && <b className="required"> *</b>}
                {hasOwner && f.key === "owner" ? (
                  <div className="owner-picker">
                    <select aria-label="負責人角色" value={ownerRole} disabled={!ownerMembers.length}
                      onChange={(e) => {
                        setOwnerRole(e.target.value);
                        setForm({ ...form, owner_member_id: "", owner: form.owner_member_id ? "" : form.owner });
                      }}>
                      <option value="">先選角色</option>
                      {ownerRoles.map((role) => <option key={role} value={role}>
                        {role === "__unassigned__" ? "未指定角色" : role}
                      </option>)}
                    </select>
                    <select aria-label="負責人成員" value={form.owner_member_id || ""} disabled={!ownerRole}
                      onChange={(e) => {
                        const member = ownerMembers.find((candidate) => candidate.id === e.target.value);
                        setForm({ ...form, owner_member_id: member?.id || "", owner: member?.person || "" });
                      }}>
                      <option value="">未指定負責人</option>
                      {ownerChoices.map((member) => <option key={member.id} value={member.id}>
                        {member.person}{member.alias ? `（${member.alias}）` : ""}{member.active ? "" : "（已停用）"}
                      </option>)}
                    </select>
                    {legacyOwner && <small className="field-hint">原負責人：{legacyOwner}（待重新指派）
                      {suggestedOwner && `；可能對應 ${personDisplay(suggestedOwner.person, suggestedOwner.alias)}，請自行確認`}
                    </small>}
                    {kind === "projects" && !isExisting && <small className="field-hint">建立專案並新增成員後，即可指定負責人。</small>}
                    {isExisting && !ownerMembers.length && <small className="field-hint">請先在「成員、角色與單價」新增專案成員。</small>}
                  </div>
                ) : (kind === "times" || kind === "members") && f.key === "role" ? (
                  <select
                    value={currentRole}
                    onChange={(e) =>
                      setForm({ ...form, role: e.target.value })
                    }
                  >
                    <option value="">未指定角色</option>
                    {currentRole && !roleOptions.includes(currentRole) && (
                      <option value={currentRole}>{currentRole}（既有角色）</option>
                    )}
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                ) : kind === "times" && f.key === "person" ? (
                  <>
                    <input
                      list="project-member-options"
                      required
                      value={form.person ?? ""}
                      onChange={(e) => {
                        const person = e.target.value;
                        const member = members.find((candidate) => candidate.active && candidate.person === person);
                        setForm({ ...form, person, role: member && roleOptions.includes(member.role) ? member.role : "" });
                      }}
                    />
                    <datalist id="project-member-options">
                      {memberNames.map((person) => <option key={person} value={person}
                        label={personDisplay(person, members.find((member) => member.person === person)?.alias)} />)}
                    </datalist>
                    {members.find((member) => member.person === form.person)?.alias &&
                      <small className="field-hint">{personDisplay(form.person, members.find((member) => member.person === form.person)?.alias)}</small>}
                    <small className="field-hint">選擇成員會帶入預設角色；也可輸入尚未建檔的人員。</small>
                  </>
                ) : kind === "rates" && f.key === "person" ? (
                  <>
                    <input list="rate-member-options" value={form.person ?? ""}
                      onChange={(e) => setForm({ ...form, person: e.target.value })} />
                    <datalist id="rate-member-options">
                      {members.map((member) => <option key={member.id} value={member.person}
                        label={personDisplay(member.person, member.alias)} />)}
                    </datalist>
                    {members.find((member) => member.person === form.person)?.alias &&
                      <small className="field-hint">{personDisplay(form.person, members.find((member) => member.person === form.person)?.alias)}</small>}
                  </>
                ) : kind === "rates" && f.key === "role" ? (
                  <>
                    <input list="project-role-options" required value={form.role ?? ""} onChange={(e) => setForm({ ...form, role: e.target.value })} />
                    <datalist id="project-role-options">{roleOptions.map((role) => <option key={role} value={role} />)}</datalist>
                  </>
                ) : f.options ? (
                  <select
                    required={f.required}
                    value={String(
                      form[f.key] ??
                        (f.key === "applicable" ? "unset" : f.options[0]),
                    )}
                    onChange={(e) =>
                      setForm({ ...form, [f.key]: e.target.value })
                    }
                  >
                    {f.options.map((v) => (
                      <option key={v} value={v}>
                        {v === ""
                          ? "請選擇含稅／未稅"
                          : f.key === "active"
                          ? v === "true" ? "啟用" : "停用"
                          : v === "unset"
                          ? "未確認"
                          : v === "true"
                            ? "是"
                            : v === "false"
                              ? "否"
                              : name(v)}
                      </option>
                    ))}
                  </select>
                ) : f.type === "textarea" ? (
                  <textarea
                    value={form[f.key] ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, [f.key]: e.target.value })
                    }
                  />
                ) : (
                  <input
                    type={f.type || "text"}
                    step={f.type === "number" ? "0.01" : undefined}
                    required={f.required}
                    readOnly={isExisting && ((kind === "roles" && f.key === "name") || (kind === "members" && f.key === "person"))}
                    value={form[f.key] ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, [f.key]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}
          </div>
          {kind === "projects" && (
            <section className="other-cost-editor" ref={costEditorRef}>
              <div className="other-cost-heading">
                <div>
                  <strong>已投入其他成本</strong>
                  <p>逐筆記錄項目與金額，合計會計入全期已投入成本。</p>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setCostItems((items) => [...items, { title: "", date: "", amount: "", note: "" }])}
                >
                  <Plus size={15} />新增項目
                </button>
              </div>
              {costItems.map((item, index) => (
                <div className="other-cost-row" key={index}>
                  <label>
                    項目
                    <input required value={item.title || ""} onChange={(e) => updateCostItem(index, "title", e.target.value)} />
                  </label>
                  <label>
                    日期
                    <input type="date" value={item.date || ""} onChange={(e) => updateCostItem(index, "date", e.target.value)} />
                  </label>
                  <label>
                    金額
                    <input required type="number" min="0" step="0.01" value={item.amount ?? ""} onChange={(e) => updateCostItem(index, "amount", e.target.value)} />
                  </label>
                  <label>
                    說明
                    <input value={item.note || ""} onChange={(e) => updateCostItem(index, "note", e.target.value)} />
                  </label>
                  <button
                    type="button"
                    className="ghost danger"
                    aria-label={`刪除其他成本項目 ${index + 1}`}
                    onClick={() => setCostItems((items) => items.filter((_, i) => i !== index))}
                  >
                    刪除
                  </button>
                </div>
              ))}
              <div className="other-cost-total">明細合計：{num(otherCostTotal)} {form.currency || "TWD"}</div>
            </section>
          )}
          {(kind === "times" || kind === "members") && <div className="notice">成員的預設角色只帶入新工時；編輯工時角色只修改這一筆紀錄。</div>}
          {err && <div className="error">{err}</div>}
          <div className="modal-foot">
            {isExisting && !["roles", "members"].includes(kind) && (
              <button type="button" className="danger ghost" onClick={remove}>
                刪除
              </button>
            )}
            <button type="button" className="secondary" onClick={close}>
              取消
            </button>
            <button disabled={busy} className="primary">
              {busy ? "儲存中…" : "儲存紀錄"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImportView({
  pid,
  notify,
  reload,
}: {
  pid: string;
  notify: (s: string) => void;
  reload: () => void;
}) {
  const [kind, setKind] = useState("times"),
    [upload, setUpload] = useState<Row | null>(null),
    [sheet, setSheet] = useState("");
  const [mapping, setMapping] = useState<Row | null>(null),
    [preview, setPreview] = useState<Row | null>(null),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  const [profiles, setProfiles] = useState<Row[]>([]),
    [skipErrors, setSkipErrors] = useState(false),
    [confirmDup, setConfirmDup] = useState(false);
  const [skipRows, setSkipRows] = useState<number[]>([]),
    [marker, setMarker] = useState(
      '{"OK":"complete","?":"question","N/A":"not_applicable"}',
    );
  useEffect(() => {
    api("/profiles")
      .then(setProfiles)
      .catch((e) => setErr(e.message));
  }, []);
  const headers =
    upload?.sheets.find((s: Row) => s.name === sheet)?.headers || [];
  const body = () => ({
    upload_id: upload?.id,
    kind,
    sheet,
    project_id: pid,
    ...(mapping ? { mapping } : {}),
    marker_map: JSON.parse(marker),
  });
  async function selectFile(file: File) {
    setBusy(true);
    setErr("");
    try {
      const f = new FormData();
      f.append("file", file);
      const r = await api("/import/inspect", "POST", f);
      setUpload(r);
      setSheet(r.sheets[0]?.name || "");
      setMapping(null);
      setPreview(null);
      setSkipRows([]);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function runPreview() {
    setBusy(true);
    setErr("");
    try {
      const r = await api("/import/preview", "POST", body());
      setPreview(r);
      setMapping(r.mapping);
      setConfirmDup(false);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    setErr("");
    try {
      const r = await api("/import/commit", "POST", {
        ...body(),
        skip_errors: skipErrors,
        skip_rows: skipRows,
      });
      notify(
        `匯入完成：新增 ${r.inserted}、更新 ${r.updated}、略過 ${r.skipped}`,
      );
      setPreview(null);
      reload();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function saveProfile() {
    const n = window.prompt("此匯入設定的名稱");
    if (!n) return;
    try {
      await api("/profiles", "POST", {
        name: n,
        kind,
        mapping,
        marker_map: JSON.parse(marker),
      });
      setProfiles(await api("/profiles"));
      notify("匯入設定已儲存");
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <>
      <div className="intro-line">
        Excel、CSV 與既有工作表，一次對應、重複使用。
      </div>
      <div className="import-grid">
        <section className="panel">
          <div className="panel-head">
            <h3>01 選擇資料來源</h3>
            <span className="muted">檔案僅於本機處理</span>
          </div>
          <label className="dropzone">
            <Upload size={32} />
            <strong>{busy ? "讀取中…" : "選擇 Excel 或 CSV"}</strong>
            <span>.xlsx / UTF-8 .csv · 上限 8 MB</span>
            <input
              type="file"
              accept=".xlsx,.csv"
              disabled={!pid || busy}
              onChange={(e) =>
                e.target.files?.[0] && selectFile(e.target.files[0])
              }
            />
          </label>
          <div className="form-grid">
            <label>
              資料類型
              <select
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  setMapping(null);
                  setPreview(null);
                }}
              >
                {[
                  "times",
                  "rates",
                  "deliverables",
                  "issues",
                  "works",
                  "payments",
                ].map((k) => (
                  <option key={k} value={k}>
                    {
                      (
                        {
                          times: "工時紀錄",
                          rates: "角色單價",
                          deliverables: "交付／功能檢視",
                          issues: "事項",
                          works: "待辦與里程碑",
                          payments: "款項",
                        } as Row
                      )[k]
                    }
                  </option>
                ))}
              </select>
            </label>
            <label>
              工作表
              <select
                value={sheet}
                onChange={(e) => {
                  setSheet(e.target.value);
                  setMapping(null);
                  setPreview(null);
                }}
              >
                <option value="">請先選檔</option>
                {upload?.sheets.map((s: Row) => (
                  <option key={s.name}>{s.name}</option>
                ))}
              </select>
            </label>
            <label className="wide">
              已儲存的欄位映射
              <select
                defaultValue=""
                onChange={(e) => {
                  const p = profiles.find((p) => p.id === e.target.value);
                  if (p) {
                    setKind(p.kind);
                    setMapping(p.mapping);
                    if (p.marker_map) setMarker(JSON.stringify(p.marker_map));
                    setPreview(null);
                  }
                }}
              >
                <option value="">自動辨識欄位</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {kind === "deliverables" && (
            <label className="block-label">
              初步檢視標記對應（JSON）
              <textarea
                value={marker}
                onChange={(e) => {
                  setMarker(e.target.value);
                  setPreview(null);
                }}
              />
              <span className="muted">
                complete＝初步檢視完成；not_applicable＝無須正式查核。均不代表測試通過。
              </span>
            </label>
          )}
          <button
            className="primary full"
            disabled={!upload || !pid || busy}
            onClick={runPreview}
          >
            <Search size={16} />
            辨識欄位與預覽
          </button>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h3>02 欄位對應</h3>
            <span className="muted">帳密與未命名來源欄排除</span>
          </div>
          {!mapping ? (
            <Empty text="選擇來源並產生預覽" />
          ) : (
            <>
              <div className="mapping-grid">
                {schemas[kind]
                  .filter(
                    (f) =>
                      ![
                        "applicable",
                        "review",
                        "result",
                        "evidence",
                        "checked_on",
                      ].includes(f.key),
                  )
                  .map((f) => (
                    <label key={f.key}>
                      {f.label}
                      <select
                        value={mapping[f.key] ?? ""}
                        onChange={(e) => {
                          const next = { ...mapping };
                          if (e.target.value) next[f.key] = e.target.value;
                          else delete next[f.key];
                          setMapping(next);
                          setPreview(null);
                        }}
                      >
                        <option value="">不匯入</option>
                        {headers
                          .filter((h: Row) => !h.excluded)
                          .map((h: Row) => (
                            <option key={h.index} value={h.index}>
                              {h.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
              </div>
              {kind === "deliverables" && (
                <label className="block-label">
                  原始檢視標記來源
                  <select
                    value={mapping.source_marker ?? ""}
                    onChange={(e) => {
                      const next = { ...mapping };
                      if (e.target.value) next.source_marker = e.target.value;
                      else delete next.source_marker;
                      setMapping(next);
                      setPreview(null);
                    }}
                  >
                    <option value="">不匯入</option>
                    {headers
                      .filter((h: Row) => !h.excluded)
                      .map((h: Row) => (
                        <option key={h.index} value={h.index}>
                          {h.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <div className="button-row">
                <button className="secondary" onClick={runPreview}>
                  更新預覽
                </button>
                <button className="ghost" onClick={saveProfile}>
                  儲存映射
                </button>
              </div>
            </>
          )}
        </section>
      </div>
      {err && <div className="error">{err}</div>}
      {preview && (
        <section className="panel">
          <div className="panel-head">
            <h3>03 確認匯入</h3>
            <span>
              {preview.records.length} 有效列 · {preview.errors.length} 錯誤 ·{" "}
              {preview.duplicate_candidates} 同內容候選
            </span>
          </div>
          {preview.already_imported && (
            <div className="notice">此檔案與映射已匯入，再次確認會略過。</div>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>匯入</th>
                  <th>來源列</th>
                  <th>內容預覽（前100筆）</th>
                </tr>
              </thead>
              <tbody>
                {preview.records.slice(0, 100).map((r: Row) => (
                  <tr key={r.row}>
                    <td>
                      <input
                        type="checkbox"
                        checked={!skipRows.includes(r.row)}
                        onChange={(e) =>
                          setSkipRows(
                            e.target.checked
                              ? skipRows.filter((n) => n !== r.row)
                              : [...skipRows, r.row],
                          )
                        }
                      />
                    </td>
                    <td>{r.row}</td>
                    <td className="preserve-line-breaks">
                      {Object.entries(r.data)
                        .filter(
                          ([k]) => !["project_id", "source_id"].includes(k),
                        )
                        .map(([k, v]) => `${k}: ${v ?? "—"}`)
                        .join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {preview.errors.length > 0 && (
            <>
              <div className="error">
                {preview.errors.slice(0, 20).map((e: Row) => (
                  <div key={e.row}>
                    第 {e.row} 列：{e.reason}
                  </div>
                ))}
              </div>
              <label className="check">
                <input
                  type="checkbox"
                  checked={skipErrors}
                  onChange={(e) => setSkipErrors(e.target.checked)}
                />
                只匯入有效列，略過錯誤列
              </label>
            </>
          )}
          {preview.duplicate_candidates > 0 && (
            <label className="check">
              <input
                type="checkbox"
                checked={confirmDup}
                onChange={(e) => setConfirmDup(e.target.checked)}
              />
              我已檢視同內容候選；保留未取消的紀錄
            </label>
          )}
          <button
            className="primary"
            disabled={
              busy ||
              (!skipErrors && preview.errors.length > 0) ||
              (!confirmDup && preview.duplicate_candidates > 0)
            }
            onClick={commit}
          >
            <Check size={16} />
            確認匯入
          </button>
        </section>
      )}
    </>
  );
}

function SettingsModal({
  close,
  notify,
}: {
  close: () => void;
  notify: (s: string) => void;
}) {
  const [rates, setRates] = useState<Row[]>([]),
    [error, setError] = useState("");
  useEffect(() => {
    api("/settings")
      .then((r) => setRates(r.sale_rates))
      .catch((e) => setError(e.message));
  }, []);
  async function save() {
    try {
      await api("/settings", "PUT", { sale_rates: rates });
      notify("預設售價已儲存於本機");
      close();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="modal-backdrop">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="本機設定"
      >
        <div className="modal-head">
          <h2>預設人天售價</h2>
          <button className="icon-button" aria-label="關閉" onClick={close}>
            <X />
          </button>
        </div>
        <p className="notice">
          只套用至之後新增的專案。已建立專案的單價可在工時與成本頁調整。成本單價須另行設定。
        </p>
        {rates.map((r, i) => (
          <div className="form-grid" key={i}>
            <label>
              角色
              <input
                value={r.role}
                onChange={(e) =>
                  setRates(
                    rates.map((v, j) =>
                      i === j ? { ...v, role: e.target.value } : v,
                    ),
                  )
                }
              />
            </label>
            <label>
              人天售價
              <input
                type="number"
                min="0"
                step="0.01"
                value={r.amount}
                onChange={(e) =>
                  setRates(
                    rates.map((v, j) =>
                      i === j ? { ...v, amount: e.target.value } : v,
                    ),
                  )
                }
              />
            </label>
            <button
              className="ghost danger"
              onClick={() => setRates(rates.filter((_, j) => j !== i))}
            >
              移除
            </button>
          </div>
        ))}
        <button
          className="secondary"
          onClick={() =>
            setRates([...rates, { role: "", amount: "" }])
          }
        >
          <Plus size={16} />
          新增角色
        </button>
        {error && <div className="error">{error}</div>}
        <div className="modal-foot">
          <button className="secondary" onClick={close}>
            取消
          </button>
          <button className="primary" onClick={save}>
            儲存本機設定
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const [showSettings, setShowSettings] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useSavedListState(
    "pm-site:sidebar-collapsed", window.innerWidth <= 720, isBoolean,
  );
  const requestSequence = useRef(0);
  const [page, setPage] = useState(0),
    [projects, setProjects] = useState<Row[]>([]),
    [overview, setOverview] = useState<Row[]>([]);
  const [pid, setPid] = useSavedListState("pm-site:selected-project", "", isString);
  const [all, setAll] = useState<Record<string, Row[]>>({}),
    [analysis, setAnalysis] = useState<Row | null>(null),
    [bootstrapped, setBootstrapped] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [modal, setModal] = useState<{ kind: string; row?: Row } | null>(null),
    [tab, setTab] = useState("members"),
    [projectTab, setProjectTab] = useState("works");
  const [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [reportTitle, setReportTitle] = useState("專案進度報告"),
    [external, setExternal] = useState(false),
    [sections, setSections] = useState([
      "effort",
      "issues",
      "works",
      "deliverables",
    ]),
    [recentReportId, setRecentReportId] = useState(""),
    [reportHistory, setReportHistory] = useState<Row[]>([]);
  const project = projects.find((p) => p.id === pid);
  function notify(s: string) {
    setToast(s);
    setTimeout(() => setToast(""), 4500);
  }
  async function load() {
    try {
      const [p, o] = await Promise.all([
        api("/records/projects?aliases=true"),
        api("/overview"),
      ]);
      setProjects(p);
      setOverview(o);
      setPid((old) =>
        p.some((r: Row) => r.id === old) ? old : p[0]?.id || "",
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function loadProject() {
    const sequence = ++requestSequence.current;
    if (!pid) {
      setAll({});
      setAnalysis(null);
      return;
    }
    try {
      const kinds = [
        "members",
        "roles",
        "times",
        "rates",
        "issues",
        "works",
        "deliverables",
        "payments",
      ];
      const results = await Promise.all(
        kinds.map((k) => api(`/records/${k}?project_id=${pid}&aliases=true`)),
      );
      const a = await api(
        `/analytics/${pid}${start || end ? "?" + new URLSearchParams({ ...(start ? { start } : {}), ...(end ? { end } : {}) }) : ""}`,
      );
      if (sequence !== requestSequence.current) return;
      setAll(Object.fromEntries(kinds.map((k, i) => [k, results[i]])));
      setAnalysis(a);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function reload() {
    load();
    loadProject();
    api("/reports")
      .then(setReportHistory)
      .catch(() => {});
  }
  useEffect(() => {
    api("/bootstrap")
      .then((r) => {
        csrf = r.csrf;
        setBootstrapped(true);
        return load();
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);
  useEffect(() => {
    if (!bootstrapped) return;
    loadProject();
    setRecentReportId("");
  }, [bootstrapped, pid, start, end]);
  useEffect(() => {
    if (page === 5)
      api("/reports")
        .then(setReportHistory)
        .catch((e) => setError(e.message));
  }, [page]);
  const summary = analysis?.summary;
  const inactiveRoleNames = new Set((all.roles || []).filter((role) => !role.active).map((role) => String(role.name).toLocaleLowerCase()));
  const roleNames = [...new Set([
    ...(all.roles || []).filter((role) => role.active).map((role) => String(role.name)),
    ...(all.members || []).map((member) => String(member.role || "")),
    ...(all.rates || []).map((rate) => String(rate.role || "")),
    ...(all.times || []).map((entry) => String(entry.role || "")),
  ].filter((role) => role && !inactiveRoleNames.has(role.toLocaleLowerCase())))].sort((a, b) => a.localeCompare(b, "zh-TW"));
  async function bulkMemberRole(member: Row) {
    const entries = (all.times || []).filter((entry) => entry.person === member.person && entry.role !== member.role);
    if (!entries.length) return;
    if (!window.confirm(`將 ${personDisplay(member.person, member.alias)} 的 ${entries.length} 筆既有工時改為「${member.role}」？歷史人工成本可能變動，請確認這些紀錄都應使用此角色。`)) return;
    try {
      const result = await api("/times/bulk-role", "POST", {
        project_id: pid, person: member.person, role: member.role,
        entries: entries.map((entry) => ({ id: entry.id, version: entry.version })),
      });
      reload();
      notify(`已更正 ${result.updated} 筆工時角色`);
    } catch (e) {
      setError((e as Error).message);
      reload();
    }
  }
  const openModal = (kind: string, row?: Row) => {
    if (kind !== "projects" && !pid) {
      notify("請先建立專案");
      return;
    }
    setModal({ kind, row });
  };
  async function demo() {
    try {
      await api("/demo", "POST");
      reload();
      notify("已載入完全合成的示範資料");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function backup() {
    try {
      const r = await api("/backups", "POST");
      notify("一致性備份已完成");
      window.location.assign("/api/backups/" + r.name);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function report() {
    try {
      const created = await api("/reports", "POST", {
        project_id: pid,
        title: reportTitle,
        external,
        sections,
        start,
        end,
      });
      setRecentReportId(created.id);
      setReportHistory((items) => [{
        id: created.id,
        at: created.snapshot.at,
        title: created.snapshot.title,
        external: created.snapshot.external,
      }, ...items]);
      api("/reports").then(setReportHistory).catch(() => {});
      notify("報告快照已建立");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function downloadChart() {
    const svg = document.querySelector(".reportable-chart svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
      type: "image/svg+xml",
    });
    const u = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = 1200;
      c.height = 600;
      const ctx = c.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 1200, 600);
      ctx.drawImage(img, 0, 0, 1200, 600);
      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = "effort-chart.png";
      a.click();
      URL.revokeObjectURL(u);
    };
    img.src = u;
  }
  return (
    <div className={sidebarCollapsed ? "shell sidebar-collapsed" : "shell"}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand">
            <span className="brand-icon">
              <FolderKanban size={23} />
            </span>
            <div>
              PM Site<small>PROJECT WORKSPACE</small>
            </div>
          </div>
          <button className="sidebar-toggle" type="button"
            aria-label={sidebarCollapsed ? "展開左側選單" : "收合左側選單"}
            title={sidebarCollapsed ? "展開選單" : "收合選單"}
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>
            <Menu size={19} />
          </button>
        </div>
        <div className="workspace-label">工作空間</div>
        <nav>
          {nav.map((n, i) => {
            const Icon = icons[i];
            return (
              <button
                key={n}
                aria-label={n}
                className={page === i ? "nav-item selected" : "nav-item"}
                onClick={() => {
                  setPage(i);
                }}
              >
                <Icon size={19} />
                {n}
                {i === 3 && (
                  <span className="nav-count">
                    {overview.reduce((s, p) => s + p.open_issues, 0)}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <button aria-label="本機設定" title="本機設定" onClick={() => setShowSettings(true)}>
            <Settings2 size={18} />
            本機設定
          </button>
          <button aria-label="備份本機資料" title="備份本機資料" onClick={backup}>
            <Archive size={18} />
            備份本機資料
          </button>
          <div className="local-label">
            <span className="dot" />
            本機模式
            <ShieldCheck size={14} />
          </div>
          <small>資料保存在此裝置</small>
        </div>
      </aside>
      {!sidebarCollapsed && <button className="sidebar-scrim" type="button"
        aria-label="收合左側選單" onClick={() => setSidebarCollapsed(true)} />}
      <main>
        <header className="topbar">
          <div className="breadcrumb">
            工作空間
            <ChevronRight size={13} />
            <span>{nav[page]}</span>
          </div>
          <div className="top-actions">
            <span className="local-pill">
              <span className="dot" /> LOCAL
            </span>
            <button
              className="icon-button"
              onClick={reload}
              aria-label="重新整理"
            >
              <RefreshCw size={17} />
            </button>
            <span className="avatar">PM</span>
          </div>
        </header>
        <div className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">PROJECT MANAGEMENT</div>
              <h1>{nav[page]}</h1>
              <p>
                {
                  [
                    "掌握重要狀態，讓下一步更清楚。",
                    "專案資料、里程碑與交付，一處整理。",
                    "看見資源投入與預算的關係。",
                    "追蹤議題、風險、變更與決策。",
                    "沿用既有報表，減少重複輸入。",
                    "將專案現況整理成可分享的報告。",
                  ][page]
                }
              </p>
            </div>
            <div className="heading-actions">
              {page !== 0 && (
                <select
                  className="project-select"
                  value={pid}
                  onChange={(e) => setPid(e.target.value)}
                  aria-label="選擇專案"
                >
                  <option value="">選擇專案</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}
              {page < 4 && page !== 2 && (
                <button
                  className="primary"
                  onClick={() =>
                    openModal(
                      page === 0 || page === 1
                        ? "projects"
                        : page === 2
                          ? tab
                          : "issues",
                    )
                  }
                >
                  <Plus size={16} />
                  {page === 0 || page === 1
                    ? "新增專案"
                    : page === 2
                      ? "新增紀錄"
                      : "新增事項"}
                </button>
              )}
            </div>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          {loading ? (
            <div className="empty">載入本機資料…</div>
          ) : !projects.length ? (
            <Empty
              text="建立你的第一個專案"
              action={
                <div className="button-row">
                  <button
                    className="primary"
                    onClick={() => openModal("projects")}
                  >
                    <Plus size={16} />
                    新增專案
                  </button>
                  <button className="secondary" onClick={demo}>
                    體驗合成示範資料
                  </button>
                </div>
              }
            />
          ) : (
            <>
              {page === 0 && (
                <>
                  <div className="stats">
                    <div className="stat">
                      <span>進行中專案</span>
                      <strong>
                        {
                          overview.filter((p) =>
                            ["active", "at_risk"].includes(p.status),
                          ).length
                        }
                        <small> / {projects.length}</small>
                      </strong>
                      <span className="stat-note">專案整體狀態由 PM 判斷</span>
                    </div>
                    <div className="stat">
                      <span>待處理事項</span>
                      <strong>
                        {overview.reduce((s, p) => s + p.open_issues, 0)}
                      </strong>
                      <span className="stat-note">議題、風險與待決策</span>
                    </div>
                    <div className="stat">
                      <span>累計投入工時</span>
                      <strong>
                        {num(
                          overview.reduce(
                            (s, p) => s + Number(p.metrics.hours),
                            0,
                          ),
                        )}
                        <small> hr</small>
                      </strong>
                      <span className="stat-note">包含跨年度紀錄</span>
                    </div>
                    <div className="stat">
                      <span>逾期待辦</span>
                      <strong className="amber">
                        {overview.reduce((s, p) => s + p.overdue, 0)}
                      </strong>
                      <span className="stat-note">期限已過且尚未完成</span>
                    </div>
                  </div>
                  <section className="panel">
                    <div className="panel-head">
                      <h3>專案組合</h3>
                      <span className="muted">
                        {projects.length} 個專案 · 全期累計
                      </span>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>專案</th>
                            <th>狀態</th>
                            <th>負責人</th>
                            <th>重要未結事項</th>
                            <th>累計工時</th>
                            <th>下一個里程碑</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {overview.map((p, i) => (
                            <tr
                              key={p.id}
                              className="clickable"
                              onClick={() => {
                                setPid(p.id);
                                setPage(1);
                              }}
                            >
                              <td>
                                <div className="project-name">
                                  <span
                                    className={"project-mark mark-" + (i % 3)}
                                  >
                                    {p.name.slice(0, 1)}
                                  </span>
                                  <div>
                                    <strong>{p.name}</strong>
                                    <small>{p.code || "尚未設定代碼"}</small>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <Badge value={p.status} />
                              </td>
                              <td>{ownerDisplay(p) || "—"}{p.owner && !p.owner_member_id && <small className="legacy-owner">待重新指派</small>}</td>
                              <td>
                                {p.open_issues ? `${p.open_issues} 件` : "—"}
                              </td>
                              <td>
                                {num(p.metrics.hours)}{" "}
                                <span className="muted">hr</span>
                              </td>
                              <td>
                                <div>
                                  {p.next_milestone?.title || "尚未設定"}
                                  <small className="muted">
                                    {p.next_milestone?.due}
                                  </small>
                                </div>
                              </td>
                              <td>
                                <ArrowUpRight size={17} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                  <div className="two-columns">
                    <ChartBox title="各專案投入">
                      <div className="chart">
                        <ResponsiveContainer>
                          <BarChart
                            data={overview.map((p) => ({
                              name: p.name,
                              hours: Number(p.metrics.hours),
                            }))}
                            margin={{ top: 15, right: 15, bottom: 5, left: 0 }}
                          >
                            <CartesianGrid vertical={false} stroke="#edf0f1" />
                            <XAxis
                              dataKey="name"
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fontSize: 11 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip />
                            <Bar
                              isAnimationActive={false}
                              dataKey="hours"
                              name="工時"
                              fill="#16877d"
                              radius={[5, 5, 0, 0]}
                              maxBarSize={50}
                            />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </ChartBox>
                    <ChartBox title="需要留意">
                      <div className="attention-list">
                        {overview.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => {
                              setPid(p.id);
                              setPage(3);
                            }}
                          >
                            <span className={"mini-dot " + p.status} />
                            <div>
                              <strong>{p.name}</strong>
                              <p className="preserve-line-breaks">
                                {p.status_reason ||
                                  `${p.open_issues} 件未結事項 · ${p.overdue} 件逾期待辦`}
                              </p>
                            </div>
                            <ChevronRight size={16} />
                          </button>
                        ))}
                      </div>
                      <div className="panel-tip">
                        <ShieldCheck size={15} />
                        狀態與數據分開呈現，保留判斷依據。
                      </div>
                    </ChartBox>
                  </div>
                </>
              )}
              {page === 1 && project && (
                <>
                  <section className="panel project-detail">
                    <div>
                      <Badge value={project.status} />
                      <h2>{project.name}</h2>
                      <p className="preserve-line-breaks">{project.summary || "尚未填寫摘要"}</p>
                      <div className="detail-meta">
                        <span>負責人：{ownerDisplay(project) || "未設定"}{project.owner && !project.owner_member_id && "（待重新指派）"}</span>
                        <span>
                          期間：{project.start || "未設定"} —{" "}
                          {project.end || "未設定"}
                        </span>
                        <span>
                          {project.currency} · {name(project.tax_basis)}
                        </span>
                      </div>
                      {project.status_reason && (
                        <div className="notice preserve-line-breaks">{project.status_reason}</div>
                      )}
                    </div>
                    <button
                      className="secondary"
                      onClick={() => openModal("projects", project)}
                    >
                      <Settings2 size={16} />
                      編輯專案與預算
                    </button>
                  </section>
                  <div className="tabs">
                    {["works", "deliverables"].map((k) => (
                      <button
                        key={k}
                        className={projectTab === k ? "active" : ""}
                        onClick={() => setProjectTab(k)}
                      >
                        {k === "works" ? "待辦與里程碑" : "交付與查核"}
                      </button>
                    ))}
                    <button
                      className="tab-action"
                      onClick={() => openModal(projectTab)}
                    >
                      <Plus size={15} />
                      新增
                    </button>
                  </div>
                  <section className="panel">
                    <DataTable
                      rows={all[projectTab] || []}
                      columns={
                        projectTab === "works"
                          ? [
                              ["title", "名稱"],
                              ["kind", "類型"],
                              ["owner", "負責人"],
                              ["due", "期限"],
                              ["status", "狀態"],
                            ]
                          : [
                              ["code", "識別碼"],
                              ["title", "功能／交付"],
                              ["system", "系統／分類"],
                              ["owner", "負責人"],
                              ["review", "初步檢視"],
                              ["applicable", "需正式查核"],
                              ["result", "正式結果"],
                            ]
                      }
                      onEdit={(r) => openModal(projectTab, r)}
                    />
                  </section>
                  {projectTab === "deliverables" && (
                    <div className="notice">
                      初步檢視完成與正式通過分開紀錄；不適用只排除指定查核，保留原交付項目。
                    </div>
                  )}
                </>
              )}
              {page === 2 && summary && (
                <>
                  <div className="toolbar">
                    <div className="date-filter">
                      <label>
                        工時期間
                        <input
                          type="date"
                          value={start}
                          onChange={(e) => setStart(e.target.value)}
                        />
                      </label>
                      <span>—</span>
                      <input
                        type="date"
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                      />
                      <button
                        className="ghost"
                        onClick={() => {
                          setStart("");
                          setEnd("");
                        }}
                      >
                        全期
                      </button>
                    </div>
                    <button className="secondary" onClick={downloadChart}>
                      <Download size={15} />
                      圖表 PNG
                    </button>
                  </div>
                  <div className="stats">
                    <div className="stat">
                      <span>選定期間工時</span>
                      <strong>
                        {num(summary.hours)}
                        <small> hr</small>
                      </strong>
                      <span className="stat-note">{summary.rows} 筆紀錄</span>
                    </div>
                    <div className="stat">
                      <span>選定期間人工成本</span>
                      <strong>{num(summary.known_labor_cost)}</strong>
                      <span className="stat-note">
                        {summary.currency} · {name(summary.tax_basis)}
                      </span>
                    </div>
                    <div className="stat">
                      <span>預計完成成本 EAC</span>
                      <strong>{num(summary.eac)}</strong>
                      <span className="stat-note">
                        專案設定的全期預計完成成本
                      </span>
                    </div>
                    <div className="stat">
                      <span>成本預算</span>
                      <strong>{num(summary.budget)}</strong>
                      <span className="stat-note">相同範圍才提供比較</span>
                    </div>
                    <div className="stat">
                      <span>選定期間人天</span>
                      <strong>
                        {num(summary.md)}
                        <small> MD</small>
                      </strong>
                      <span className="stat-note">
                        按專案設定的標準工時換算
                      </span>
                    </div>
                    <div className="stat">
                      <span>全期已投入成本</span>
                      <strong>{num(summary.actual_cost)}</strong>
                      <span className="stat-note">完整人工成本＋其他投入</span>
                    </div>
                    <div className="stat">
                      <span>核定收入</span>
                      <strong>{num(summary.revenue)}</strong>
                      <span className="stat-note">
                        專案全期 · {summary.currency}
                      </span>
                    </div>
                    <div className="stat">
                      <span>預估餘額</span>
                      <strong>{num(summary.profit)}</strong>
                      <span className="stat-note">全期核定收入－EAC</span>
                    </div>
                    <div className="stat">
                      <span>剩餘成本 ETC</span>
                      <strong>{num(summary.etc)}</strong>
                      <span className="stat-note">
                        EAC－全期已投入成本 AC（自動）
                      </span>
                    </div>
                  </div>
                  {summary.missing_rate_rows > 0 && (
                    <div className="notice">
                      {summary.missing_rate_rows}{" "}
                      筆缺少角色、有效單價、人天換算或專案金額口徑；目前已映射{" "}
                      {num(summary.mapped_hours)} 小時。
                    </div>
                  )}
                  {summary.full_missing_rate_rows > 0 && (
                    <div className="notice">
                      全期有 {summary.full_missing_rate_rows}{" "}
                      筆工時尚無完整成本映射，AC 與 ETC 保留待估。
                    </div>
                  )}
                  {summary.legacy_basis_conflicts > 0 && (
                    <div className="notice">
                      {summary.legacy_basis_conflicts} 筆歷史單價的舊稅別與專案不同。
                      請確認單價金額已符合專案口徑，再編輯並儲存該單價。
                    </div>
                  )}
                  {(start || end) && (
                    <div className="notice">
                      目前篩選工時期間；AC、EAC、ETC、核定收入與預估餘額維持專案全期數值。
                    </div>
                  )}
                  <div className="two-columns">
                    <ChartBox title="投入趨勢">
                      <div className="chart reportable-chart">
                        <ResponsiveContainer>
                          <AreaChart
                            data={summary.monthly}
                            margin={{ top: 15, right: 15, left: 0, bottom: 5 }}
                          >
                            <defs>
                              <linearGradient
                                id="effortFill"
                                x1="0"
                                x2="0"
                                y1="0"
                                y2="1"
                              >
                                <stop
                                  offset="0%"
                                  stopColor="#16877d"
                                  stopOpacity={0.22}
                                />
                                <stop
                                  offset="100%"
                                  stopColor="#16877d"
                                  stopOpacity={0}
                                />
                              </linearGradient>
                            </defs>
                            <CartesianGrid vertical={false} stroke="#edf0f1" />
                            <XAxis
                              dataKey="name"
                              tick={{ fontSize: 12 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <YAxis
                              tick={{ fontSize: 11 }}
                              axisLine={false}
                              tickLine={false}
                            />
                            <Tooltip />
                            <Area
                              isAnimationActive={false}
                              dataKey="hours"
                              name="工時"
                              stroke="#16877d"
                              fill="url(#effortFill)"
                              strokeWidth={2.5}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </ChartBox>
                    <ChartBox title="工作分類投入">
                      <div className="chart">
                        <ResponsiveContainer>
                          <PieChart>
                            <Pie
                              isAnimationActive={false}
                              data={summary.categories}
                              dataKey="hours"
                              nameKey="name"
                              innerRadius={65}
                              outerRadius={92}
                              paddingAngle={3}
                            >
                              {summary.categories.map((_: Row, i: number) => (
                                <Cell
                                  key={i}
                                  fill={colors[i % colors.length]}
                                />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="legend">
                        {summary.categories.map((r: Row, i: number) => (
                          <span key={r.name}>
                            <i
                              style={{ background: colors[i % colors.length] }}
                            />
                            {r.name} {num(r.hours)} hr
                          </span>
                        ))}
                      </div>
                    </ChartBox>
                  </div>
                  <div className="tabs">
                    {["members", "times", "payments"].map((k) => (
                      <button
                        key={k}
                        className={tab === k ? "active" : ""}
                        onClick={() => setTab(k)}
                      >
                        {
                          (
                            {
                              members: "成員、角色與單價",
                              times: "工時紀錄",
                              payments: "款項與收款",
                            } as Row
                          )[k]
                        }
                      </button>
                    ))}
                    {tab !== "members" && <button
                      className="tab-action"
                      onClick={() => openModal(tab)}
                    >
                      <Plus size={15} />
                      {({
                        times: "新增工時",
                        payments: "新增款項",
                      } as Row)[tab]}
                    </button>}
                    {tab !== "members" && <a
                      className="tab-action"
                      href={`/api/exports/${tab}?project_id=${pid}&fmt=xlsx`}
                    >
                      <Download size={15} />
                      Excel
                    </a>}
                  </div>
                  {tab === "members" ? <ProjectPeoplePanel
                    projectId={pid}
                    members={all.members || []}
                    roles={all.roles || []}
                    times={all.times || []}
                    rates={all.rates || []}
                    onOpen={openModal}
                    onBulkRole={bulkMemberRole}
                  /> : <section className="panel">
                    {tab === "times" ? (
                      <TimeRecordsTable
                        key={pid}
                        projectId={pid}
                        rows={all.times || []}
                        onEdit={(row) => openModal("times", row)}
                      />
                    ) : (
                      <DataTable
                        rows={all.payments || []}
                        columns={[
                          ["title", "款項"],
                          ["amount", "約定額"],
                          ["due", "日期"],
                          ["invoiced", "已開票"],
                          ["received", "已收款"],
                        ]}
                        onEdit={(r) => openModal("payments", r)}
                      />
                    )}
                  </section>}
                  <div className="notice">
                    成本單價按有效期間套用；核定收入、開票與收款各自記錄。
                  </div>
                </>
              )}
              {page === 3 && (
                <IssueRecordsTable key={pid} projectId={pid} rows={all.issues || []}
                  onEdit={(r) => openModal("issues", r)} />
              )}
              {page === 4 && (
                <ImportView pid={pid} notify={notify} reload={reload} />
              )}
              {page === 5 && (
                <>
                  <div className="report-layout">
                    <section className="panel report-settings">
                      <div className="panel-head">
                        <h3>報告設定</h3>
                        <FileChartColumn size={18} />
                      </div>
                      <label className="block-label">
                        簡報標題
                        <input
                          value={reportTitle}
                          onChange={(e) => setReportTitle(e.target.value)}
                        />
                      </label>
                      <label className="block-label">
                        輸出版本
                        <select
                          value={external ? "external" : "internal"}
                          onChange={(e) =>
                            setExternal(e.target.value === "external")
                          }
                        >
                          <option value="internal">內部管理版（含成本）</option>
                          <option value="external">
                            對外進度版（排除成本與人員欄位）
                          </option>
                        </select>
                      </label>
                      <div className="form-grid">
                        <label>
                          工時起日
                          <input
                            type="date"
                            value={start}
                            onChange={(e) => setStart(e.target.value)}
                          />
                        </label>
                        <label>
                          工時迄日
                          <input
                            type="date"
                            value={end}
                            onChange={(e) => setEnd(e.target.value)}
                          />
                        </label>
                      </div>
                      <div className="block-label">報告章節</div>
                      {[
                        "effort",
                        "issues",
                        "works",
                        "deliverables",
                      ].map((k) => (
                        <label className="check" key={k}>
                          <input
                            type="checkbox"
                            checked={sections.includes(k)}
                            onChange={(e) =>
                              setSections(
                                e.target.checked
                                  ? [...sections, k]
                                  : sections.filter((s) => s !== k),
                              )
                            }
                          />
                          {
                            (
                              {
                                effort: "工時與成本",
                                issues: "議題與決策",
                                works: "待辦與里程碑",
                                deliverables: "交付與查核",
                              } as Row
                            )[k]
                          }
                        </label>
                      ))}
                      <button
                        className="primary report-create-button"
                        onClick={report}
                        disabled={!pid}
                      >
                        建立報告快照
                      </button>
                      <p className="muted">
                        期間篩選只套用工時；其餘章節為截點當下狀態。對外摘要與標題請自行確認適合分享。
                      </p>
                    </section>
                    <section className="panel report-history">
                      <div className="panel-head">
                        <h3>已封存報告</h3>
                        <span className="muted">建立後可直接下載；快照固定保存於本機</span>
                      </div>
                      {reportHistory.length ? (
                        <div className="history-list">
                          {reportHistory.map((r) => (
                            <div className={r.id === recentReportId ? "recent-report" : ""} key={r.id}>
                              <div>
                                <strong>{r.title || "專案報告"}</strong>
                                {r.id === recentReportId && <span className="recent-report-label">剛建立</span>}
                                <small>
                                  {r.at.slice(0, 19).replace("T", " ")} ·{" "}
                                  {r.external ? "對外版" : "內部版"}
                                </small>
                              </div>
                              <a className="link" href={`/api/reports/${r.id}/pptx`}>
                                <Download size={15} />
                                下載 PPTX
                              </a>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <Empty text="尚無封存報告" />
                      )}
                    </section>
                  </div>
                </>
              )}
            </>
          )}
          <footer>
            PM Site <span>本機工作空間 · 數據可追溯，未知值保留待估</span>
          </footer>
        </div>
      </main>
      {showSettings && (
        <SettingsModal close={() => setShowSettings(false)} notify={notify} />
      )}{" "}
      {modal && (
        <RecordModal
          kind={modal.kind}
          row={modal.row}
          pid={pid}
          rates={(all.rates || []).filter((rate) => rate.project_id === pid)}
          members={(all.members || []).filter((member) => member.project_id === (modal.kind === "projects" ? modal.row?.id : pid))}
          roleNames={roleNames}
          close={() => setModal(null)}
          saved={reload}
        />
      )}{" "}
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
