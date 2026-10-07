# 開發與發布

Python 3.11+；前端開發需要 Node.js 22.12+ 或 24+，pnpm 11。日常執行使用已提交的本機靜態檔。

```powershell
python -m venv .venv
.venv\Scripts\python.exe -m pip install -e ".[dev]"
cd frontend
pnpm install --frozen-lockfile
pnpm test
pnpm run build
cd ..
.venv\Scripts\python.exe -m pytest
.venv\Scripts\python.exe -m ruff check app tests scripts
.venv\Scripts\python.exe scripts/check_ui_style.py
```

前端開發：在後端環境設定 `PM_DEV_ORIGIN=http://127.0.0.1:5173`，啟動 loopback 後端與 `pnpm run dev`。代理 `/api` 到 8765，資產需在同一個來源使用。日常操作不啟用開發伺服器。

## 介面開發要求

介面修改須遵循 [介面風格要求](UI_STYLE.md)：沿用根層字型、字級及既有面板／按鈕／表單樣式；新增 CSS 以元件類名限定，並檢查桌面及 1050px、720px 以下版面。`scripts/check_ui_style.py` 由 CI 執行，攔截額外字型設定與遠端樣式來源。正式建置後提交更新的 `app/static` 產物；CI 也會檢查建置產物與提交內容一致。

## 公開前檢查

只加入程式、一般操作文檔、合成測試與經驗證的前端建置檔。請勿直接使用 `git add .` 加入私人資料。

```powershell
.venv\Scripts\python.exe scripts/publication_guard.py
.venv\Scripts\python.exe scripts/publication_guard.py --history
```

第一個指令掃描實際 Git index，第二個掃描所有本機可達提交。使用者可於未追蹤的 `.private-publication-rules.json` 建立 JSON 字串陣列，例如私人客戶與人員關鍵字。掃描只報檔名與分類，不輸出匹配內容。私人規則本身禁止發布。

白名單與規則掃描是補強措施，仍需檢查 staged diff、Git metadata 與文檔內容。來源工作表、資料庫、備份、報告、截圖、私人設計稿與本機帳號路徑都不應進入公開 Git 歷史。

首次安裝可先下載 Python wheels 到私人目錄，再在受限環境使用 `pip --no-index --find-links` 安裝固定依賴。程式不會變更系統 proxy、企業網路設定或終止其他專案的服務。
