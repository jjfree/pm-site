# 介面風格要求

所有新頁面與元件沿用 `frontend/src/styles.css` 的設計語彙，保持本機專案工作空間的一致性。

## 字體與排版

- 字型只在 `:root` 定義，使用 `--font-family-ui`：Inter、Segoe UI、Microsoft JhengHei、sans-serif。表單控制項繼承字型，不在個別元件、行內樣式或其他 CSS 檔重新指定字型。
- 不載入遠端字型、CSS 或其他 CDN 資源。一般文字沿用根字級；輔助文字使用 `--font-size-secondary`，標題沿用既有 `h1`／`h2`／`h3` 層級。
- 按鈕、標籤及表格欄名使用現有用語與字級，不為單一頁面另設相近的字體規格。
- `textarea` 編輯的內容或匯入的多行文字，在列表、詳情、摘要卡及預覽等唯讀畫面須保留原有換行，沿用 `.preserve-line-breaks`；長字串需可換行。以純文字呈現內容，不用 HTML 注入處理換行。

## 元件與色彩

- 優先使用現有的 `.panel`、`.panel-head`、`.secondary`、`.primary`、`.link`、`.notice` 和表單樣式。新增樣式放在 `frontend/src/styles.css`，以元件範圍類名限定，避免更改其他頁面。
- 分隔線、淺底色及次要字級使用根層 CSS 變數；新增顏色前，先確認既有色彩是否適用。
- 圖示使用既有的 Lucide 套件及相近尺寸；互動元素需保留清楚的文字標籤、鍵盤焦點與停用狀態。

## 驗證

- 新增或調整介面後，檢查桌面寬度及 1050px、720px 以下的版面，不得出現主要操作被遮住或文字擠壓。
- 執行 `python scripts/check_ui_style.py`、前端型別檢查與正式建置。字型來源及遠端樣式由 CI 自動檢查；視覺對齊、閱讀順序及響應式版面仍需人工檢視。
