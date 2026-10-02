import React, { useEffect, useState, useRef } from "react";
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
    { key: "code", label: "代碼" },
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
      options: ["unknown", "inclusive", "exclusive"],
    },
    { key: "budget", label: "成本預算", type: "number" },
    { key: "revenue", label: "核定收入", type: "number" },
    { key: "etc", label: "剩餘成本估算 ETC", type: "number" },
    { key: "other_cost", label: "已投入其他成本", type: "number" },
    { key: "budget_start", label: "預算範圍起日（空白＝全期）", type: "date" },
    { key: "budget_end", label: "預算範圍迄日", type: "date" },
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
    {
      key: "tax_basis",
      label: "稅別",
      options: ["unknown", "inclusive", "exclusive"],
    },
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
  scenarios: [
    { key: "name", label: "情境名稱", required: true },
    { key: "removed_value", label: "減少的原交付價值", type: "number" },
    {
      key: "additional_revenue",
      label: "新增／替代收入（優先使用）",
      type: "number",
    },
    {
      key: "billable_md",
      label: "可請款 MD（收入未填時使用）",
      type: "number",
    },
    { key: "sale_role", label: "售價角色" },
    { key: "rate_date", label: "單價適用日", type: "date" },
    { key: "cost_change", label: "剩餘成本變化（可負值）", type: "number" },
    {
      key: "status",
      label: "情境狀態",
      options: ["draft", "approved", "rejected"],
    },
    { key: "notes", label: "假設與說明", type: "textarea" },
  ],
  payments: [
    { key: "title", label: "款項名稱", required: true },
    { key: "amount", label: "約定金額", type: "number", required: true },
    { key: "due", label: "預定日期", type: "date" },
    { key: "invoiced", label: "已開票", type: "number" },
    { key: "received", label: "已收款", type: "number" },
  ],
};
const defaults: Row = {
  projects: {
    status: "active",
    currency: "TWD",
    tax_basis: "unknown",
    other_cost: "0",
  },
  rates: {
    purpose: "cost",
    unit: "day",
    start: "2000-01-01",
    tax_basis: "unknown",
  },
  issues: { kind: "issue", priority: "medium", status: "open" },
  works: { kind: "task", status: "todo" },
  deliverables: { review: "unknown", result: "unknown", applicable: "unset" },
  scenarios: { removed_value: "0", status: "draft" },
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
}: {
  rows: Row[];
  columns: [string, string][];
  onEdit?: (r: Row) => void;
}) {
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map(([k, l]) => (
              <th key={k}>{l}</th>
            ))}
            {onEdit && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || i}>
              {columns.map(([k]) => (
                <td key={k}>
                  {[
                    "status",
                    "priority",
                    "kind",
                    "purpose",
                    "review",
                    "result",
                  ].includes(k) ? (
                    <Badge value={r[k]} />
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

function RecordModal({
  kind,
  row,
  pid,
  close,
  saved,
}: {
  kind: string;
  row?: Row;
  pid: string;
  close: () => void;
  saved: () => void;
}) {
  const [form, setForm] = useState<Row>({
    ...defaults[kind],
    ...row,
    ...(kind !== "projects" ? { project_id: pid } : {}),
  });
  const [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
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
        body[f.key] = v;
      });
      if (kind !== "projects") body.project_id = pid;
      if (row) {
        body.version = row.version;
        if (row.source_id) body.source_id = row.source_id;
        if (row.source_marker) body.source_marker = row.source_marker;
      }
      await api(
        "/records/" + kind + (row ? "/" + row.id : ""),
        row ? "PUT" : "POST",
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
            {row ? "編輯" : "新增"}
            {
              (
                {
                  projects: "專案",
                  times: "工時",
                  rates: "單價",
                  issues: "事項",
                  works: "待辦／里程碑",
                  deliverables: "交付／查核",
                  scenarios: "情境",
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
          <div className="form-grid">
            {schemas[kind].map((f) => (
              <label
                className={f.type === "textarea" ? "wide" : ""}
                key={f.key}
              >
                {f.label}
                {f.required && <b className="required"> *</b>}
                {f.options ? (
                  <select
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
                        {v === "unset"
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
                    value={form[f.key] ?? ""}
                    onChange={(e) =>
                      setForm({ ...form, [f.key]: e.target.value })
                    }
                  />
                )}
              </label>
            ))}
          </div>
          {err && <div className="error">{err}</div>}
          <div className="modal-foot">
            {row && (
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
                    <td>
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
            <label>
              稅別
              <select
                value={r.tax_basis}
                onChange={(e) =>
                  setRates(
                    rates.map((v, j) =>
                      i === j ? { ...v, tax_basis: e.target.value } : v,
                    ),
                  )
                }
              >
                {["unknown", "exclusive", "inclusive"].map((v) => (
                  <option value={v} key={v}>
                    {name(v)}
                  </option>
                ))}
              </select>
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
            setRates([...rates, { role: "", amount: "", tax_basis: "unknown" }])
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
  const requestSequence = useRef(0);
  const [page, setPage] = useState(0),
    [projects, setProjects] = useState<Row[]>([]),
    [overview, setOverview] = useState<Row[]>([]),
    [pid, setPid] = useState("");
  const [all, setAll] = useState<Record<string, Row[]>>({}),
    [analysis, setAnalysis] = useState<Row | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState("");
  const [modal, setModal] = useState<{ kind: string; row?: Row } | null>(null),
    [tab, setTab] = useState("times"),
    [projectTab, setProjectTab] = useState("works"),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("all");
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
    [scenarioId, setScenarioId] = useState(""),
    [snapshot, setSnapshot] = useState<Row | null>(null),
    [reportHistory, setReportHistory] = useState<Row[]>([]);
  const project = projects.find((p) => p.id === pid);
  function notify(s: string) {
    setToast(s);
    setTimeout(() => setToast(""), 4500);
  }
  async function load() {
    try {
      const [p, o] = await Promise.all([
        api("/records/projects"),
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
        "times",
        "rates",
        "issues",
        "works",
        "deliverables",
        "scenarios",
        "payments",
      ];
      const results = await Promise.all(
        kinds.map((k) => api(`/records/${k}?project_id=${pid}`)),
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
        return load();
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);
  useEffect(() => {
    loadProject();
    setSnapshot(null);
  }, [pid, start, end]);
  useEffect(() => {
    if (page === 5)
      api("/reports")
        .then(setReportHistory)
        .catch((e) => setError(e.message));
  }, [page]);
  const summary = analysis?.summary;
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
      setSnapshot(
        await api("/reports", "POST", {
          project_id: pid,
          title: reportTitle,
          external,
          sections,
          scenario_id: scenarioId,
          start,
          end,
        }),
      );
      setReportHistory(await api("/reports"));
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
  const filteredIssues = (all.issues || []).filter(
    (i) =>
      (filter === "all" || i.status === filter) &&
      (i.title + i.owner + i.description)
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-icon">
            <FolderKanban size={23} />
          </span>
          <div>
            PM Site<small>PROJECT WORKSPACE</small>
          </div>
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
                  setSearch("");
                  setFilter("all");
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
          <button onClick={() => setShowSettings(true)}>
            <Settings2 size={18} />
            本機設定
          </button>
          <button onClick={backup}>
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
              {page < 4 && (
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
                              <td>{p.owner || "—"}</td>
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
                              setPage(1);
                            }}
                          >
                            <span className={"mini-dot " + p.status} />
                            <div>
                              <strong>{p.name}</strong>
                              <p>
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
                      <p>{project.summary || "尚未填寫摘要"}</p>
                      <div className="detail-meta">
                        <span>負責人：{project.owner || "未設定"}</span>
                        <span>
                          期間：{project.start || "未設定"} —{" "}
                          {project.end || "未設定"}
                        </span>
                        <span>
                          {project.currency} · {name(project.tax_basis)}
                        </span>
                      </div>
                      {project.status_reason && (
                        <div className="notice">{project.status_reason}</div>
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
                      <span>已映射人工成本</span>
                      <strong>{num(summary.known_labor_cost)}</strong>
                      <span className="stat-note">
                        {summary.currency} · {name(summary.tax_basis)}
                      </span>
                    </div>
                    <div className="stat">
                      <span>預計完成成本 EAC</span>
                      <strong>{num(summary.eac)}</strong>
                      <span className="stat-note">全期已投入＋剩餘估算</span>
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
                  </div>
                  {summary.missing_rate_rows > 0 && (
                    <div className="notice">
                      {summary.missing_rate_rows}{" "}
                      筆缺少角色、有效單價、人天換算或一致稅別；目前已映射{" "}
                      {num(summary.mapped_hours)} 小時。完整成本仍待估。
                    </div>
                  )}
                  {(start || end) && (
                    <div className="notice">
                      目前篩選工時期間。全專案成本與完工預估保留待估，請切回全期查看。
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
                    {["times", "rates", "scenarios", "payments"].map((k) => (
                      <button
                        key={k}
                        className={tab === k ? "active" : ""}
                        onClick={() => setTab(k)}
                      >
                        {
                          (
                            {
                              times: "工時紀錄",
                              rates: "單價設定",
                              scenarios: "收入情境",
                              payments: "款項與收款",
                            } as Row
                          )[k]
                        }
                      </button>
                    ))}
                    <a
                      className="tab-action"
                      href={`/api/exports/${tab}?project_id=${pid}&fmt=xlsx`}
                    >
                      <Download size={15} />
                      Excel
                    </a>
                  </div>
                  <section className="panel">
                    <DataTable
                      rows={
                        tab === "scenarios"
                          ? analysis.scenarios
                          : all[tab] || []
                      }
                      columns={
                        tab === "times"
                          ? [
                              ["date", "日期"],
                              ["person", "人員"],
                              ["role", "角色"],
                              ["category", "分類"],
                              ["hours", "小時"],
                              ["content", "工作內容"],
                            ]
                          : tab === "rates"
                            ? [
                                ["role", "角色"],
                                ["person", "人員"],
                                ["purpose", "用途"],
                                ["amount", "單價"],
                                ["unit", "單位"],
                                ["start", "有效起日"],
                                ["end", "迄日"],
                              ]
                            : tab === "scenarios"
                              ? [
                                  ["name", "情境"],
                                  ["status", "狀態"],
                                  ["replacement_revenue", "替代收入"],
                                  ["net_revenue_decrease", "淨減收"],
                                  ["revised_revenue", "修訂收入"],
                                  ["revised_eac", "修訂成本"],
                                ]
                              : [
                                  ["title", "款項"],
                                  ["amount", "約定額"],
                                  ["due", "日期"],
                                  ["invoiced", "已開票"],
                                  ["received", "已收款"],
                                ]
                      }
                      onEdit={(r) =>
                        openModal(
                          tab,
                          tab === "scenarios"
                            ? all.scenarios.find((s) => s.id === r.id)
                            : r,
                        )
                      }
                    />
                  </section>
                  <div className="notice">
                    售價與內部成本分開設定，單價按有效期間套用；核定收入、開票與收款各自記錄。情境不覆蓋原核定資料。
                  </div>
                </>
              )}
              {page === 3 && (
                <>
                  <div className="toolbar">
                    <div className="search">
                      <Search size={16} />
                      <input
                        placeholder="搜尋標題、負責人或內容"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </div>
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option value="all">全部狀態</option>
                      {["open", "in_progress", "resolved", "closed"].map(
                        (v) => (
                          <option key={v} value={v}>
                            {name(v)}
                          </option>
                        ),
                      )}
                    </select>
                  </div>
                  <section className="panel">
                    <DataTable
                      rows={filteredIssues}
                      columns={[
                        ["title", "事項"],
                        ["kind", "類型"],
                        ["priority", "優先級"],
                        ["owner", "負責人"],
                        ["due", "期限"],
                        ["status", "狀態"],
                        ["action", "處置行動"],
                      ]}
                      onEdit={(r) => openModal("issues", r)}
                    />
                  </section>
                </>
              )}
              {page === 4 && (
                <ImportView pid={pid} notify={notify} reload={reload} />
              )}
              {page === 5 && (
                <>
                  <div className="report-layout">
                    <section className="panel">
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
                      <label className="block-label">
                        變更情境
                        <select
                          value={scenarioId}
                          onChange={(e) => setScenarioId(e.target.value)}
                        >
                          <option value="">不加入情境</option>
                          {(all.scenarios || []).map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="block-label">報告章節</div>
                      {[
                        "effort",
                        "issues",
                        "works",
                        "deliverables",
                        "scenario",
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
                                scenario: "變更情境",
                              } as Row
                            )[k]
                          }
                        </label>
                      ))}
                      <button
                        className="primary full"
                        onClick={report}
                        disabled={!pid}
                      >
                        建立報告快照
                      </button>
                      <p className="muted">
                        期間篩選只套用工時；其餘章節為截點當下狀態。對外摘要與標題請自行確認適合分享。
                      </p>
                    </section>
                    <section className="panel report-preview">
                      <div className="panel-head">
                        <h3>快照預覽</h3>
                        <span className="muted">匯出後不隨資料更新</span>
                      </div>
                      {snapshot ? (
                        <>
                          <div className="slide-preview">
                            <span className="eyebrow">PROJECT REPORT</span>
                            <h2>{snapshot.snapshot.title}</h2>
                            <h3>{snapshot.snapshot.project.name}</h3>
                            <p>
                              {snapshot.snapshot.project.summary ||
                                "尚未填寫摘要"}
                            </p>
                            <small>
                              {snapshot.snapshot.at.slice(0, 10)} ·{" "}
                              {snapshot.snapshot.external ? "對外版" : "內部版"}
                            </small>
                          </div>
                          <div className="snapshot-info">
                            <span>
                              {snapshot.snapshot.issues.length} 件事項
                            </span>
                            <span>{snapshot.snapshot.works.length} 筆工作</span>
                            <span>
                              {snapshot.snapshot.deliverables.length} 項交付
                            </span>
                          </div>
                          <a
                            className="primary"
                            href={`/api/reports/${snapshot.id}/pptx`}
                          >
                            <Download size={16} />
                            下載可編輯 PowerPoint
                          </a>
                        </>
                      ) : (
                        <Empty text="建立快照以預覽報告" />
                      )}
                    </section>
                  </div>
                  <section className="panel">
                    <div className="panel-head">
                      <h3>已封存報告</h3>
                      <span className="muted">本機保存</span>
                    </div>
                    {reportHistory.length ? (
                      <div className="history-list">
                        {reportHistory.map((r) => (
                          <div key={r.id}>
                            <div>
                              <strong>{r.title || "專案報告"}</strong>
                              <small>
                                {r.at.slice(0, 19).replace("T", " ")} ·{" "}
                                {r.external ? "對外版" : "內部版"}
                              </small>
                            </div>
                            <a
                              className="link"
                              href={`/api/reports/${r.id}/pptx`}
                            >
                              <Download size={15} />
                              PPTX
                            </a>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <Empty text="尚無封存報告" />
                    )}
                  </section>
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
