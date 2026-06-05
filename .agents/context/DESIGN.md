# Design

漫畫墨印 × 工具精準。黑線、白紙、網點、墨紅。雙色票（深/淺），跟隨系統 + 手動切換。純 CSS + React，零外部資源（離線可用）。

## Theme

兩組色票以 `data-theme="light" | "dark"` 在 `:root` 切換；預設讀 `prefers-color-scheme`，使用者切換後存 localStorage（key `manga-ocr-translator-theme`）。全部用 OKLCH。

### Light（紙）

```
--bg:        oklch(0.985 0.002 250)   /* 近白冷調紙面，刻意避開奶油暖白 */
--surface:   oklch(1 0 0)             /* 純白面板 */
--surface-2: oklch(0.965 0.003 250)   /* 次級面：進階區、頁尾、表頭 */
--ink:       oklch(0.22 0.012 262)    /* 墨黑主文字 */
--ink-muted: oklch(0.46 0.012 262)    /* 次要文字，對白 ≥4.5:1 */
--line:      oklch(0.90 0.005 262)    /* 表單/分隔 hairline */
--frame:     oklch(0.22 0.012 262)    /* 分鏡粗框＝墨黑 */
--accent:    oklch(0.60 0.21 27)      /* 墨紅：選取/指示/active */
--accent-strong: oklch(0.52 0.20 27)  /* 按鈕底/連結文字（白字 ≥4.5:1） */
--accent-weak:   oklch(0.95 0.04 27)  /* 墨紅淡底：選取列、tag */
--focus:     oklch(0.55 0.21 27)
--danger:    oklch(0.52 0.20 27)      /* 與墨紅同family；錯誤 */
--ok:        oklch(0.52 0.13 150)
```

### Dark（墨）

```
--bg:        oklch(0.18 0.012 265)    /* 墨黑底，非純黑 */
--surface:   oklch(0.225 0.013 265)   /* 面板 */
--surface-2: oklch(0.26 0.014 265)    /* 次級面 */
--ink:       oklch(0.95 0.005 250)    /* 紙白主文字 */
--ink-muted: oklch(0.70 0.01 250)     /* 次要文字，對底 ≥4.5:1 */
--line:      oklch(0.34 0.012 265)    /* hairline */
--frame:     oklch(0.86 0.008 250)    /* 分鏡粗框＝紙白線 */
--accent:    oklch(0.66 0.20 29)      /* 墨紅（提亮） */
--accent-strong: oklch(0.66 0.20 29)
--accent-weak:   oklch(0.30 0.07 29)  /* 墨紅暗底 */
--accent-ink:    oklch(0.18 0.012 265)/* 紅底上的黑字（海報感） */
--focus:     oklch(0.70 0.19 29)
--danger:    oklch(0.66 0.19 25)
--ok:        oklch(0.72 0.15 150)
```

## Typography

- 單一 UI 字族（product register）：`Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Noto Sans TC", sans-serif`。已在用，不新增字體依賴。
- Mono（原始輸出/原文/JSON）：`ui-monospace, "SF Mono", "Cascadia Code", Menlo, monospace`。
- 固定 rem scale（非 fluid）：h1 1.6rem / h2 1.05rem / body 0.95rem / small 0.82rem。比例約 1.2。
- **Wordmark 是唯一 display moment**：「漫畫翻譯神器」用 800 weight、`letter-spacing: -0.02em`、輕微 `skew(-6deg)` 斜體 + 墨紅底白字的「印章」色塊，營造漫畫標題感——但不外溢到任何 UI 標籤/按鈕/資料。
- label/button 維持 sans、weight 600、不用 display、不全大寫長句（僅短標籤可大寫 + tracking）。

## Manga identity treatments（只在框架/識別/空狀態）

- **分鏡框 frame**：app 殼層與結果面板用 `2px solid var(--frame)` 粗黑（暗色為粗白）邊，搭 `4px 4px 0 var(--frame)` 硬陰影（offset、無模糊）＝漫畫格子的印刷感。一般表單欄位仍是 1px hairline，不套粗框。
- **網點 halftone**：CSS `radial-gradient` 圓點圖樣（`background-image` + `background-size: 6px 6px`），低透明度，只鋪在 header 帶狀區與空狀態/拖放區，純裝飾。
- **速度線 / 處理中**：OCR/翻譯 running 時，狀態列用斜向重複線性漸層動畫（`@keyframes` 平移），表達「進行中」；`prefers-reduced-motion` 改為靜態斜紋 + 文字。
- **墨紅 accent**：primary 按鈕（重新翻譯/開始）、active 下拉、選取列、連結、處理中指示；inactive 一律走中性，不上滿版紅。

## Components

- 全互動元件含 default / hover / focus(-visible ring) / active / disabled / loading。
- 下拉、輸入、textarea：1px `--line`、radius 6px、focus 時 2px `--focus` ring（`box-shadow`），維持原生控制，不自造 scrollbar/modal。
- 按鈕：primary＝`--accent-strong` 底 + 白字（暗色＝紅底 + `--accent-ink` 黑字）；secondary＝`--surface` 底 + `--frame` 1px 邊 + ink 字。
- **譯文對照表**＝核心：兩欄 grid（原文 mono 可編輯 / 譯文）。表頭墨黑帶（暗色墨白），列間 hairline，hover 列淡 `--surface-2`，尚未翻譯的譯文以 `--ink-muted` 斜體佔位。
- **空狀態教學**：未上傳時，左欄上傳區是網點虛框拖放區 + 一句「拖入或選擇漫畫圖片」；右欄結果區放極簡網點插畫 + 「選好兩個模型、上傳圖片就會自動翻譯」。不是空白。
- **進階摺疊**：`<details>` 原生，summary 為「進階設定」齒輪標籤；內含 Ollama 位址、prompt mode、來源語言、逾時、模型清單、提示詞檢視。
- skeleton：模型清單載入用骨架列，不用置中 spinner。

## Layout

- 雙欄 app 殼層：`grid-template-columns: minmax(300px, 360px) 1fr`，左控制+圖片、右結果。`gap` 24px。
- 頂部 header band：wordmark（左）+ 主題切換鈕（右），下緣粗黑分鏡線。
- 斷點 ≤860px：單欄堆疊（左欄移上、右欄結果在下）；表格雙欄轉單欄（原文上、譯文下，沿用既有 RWD 規則）。
- z-index 語意尺度：base / sticky-header / details-open / focus-ring。無 999。

## Motion

- 150–250ms，`ease-out`（quart/expo）；hover/focus/狀態切換用。
- 速度線處理中動畫（線性、無限）＝唯一裝飾性但承載「進行中」狀態，合法。
- 全部動態有 `prefers-reduced-motion: reduce` 替代（crossfade / 靜態）。
- 不做進場編排、不動 layout 屬性。

## Bans（沿用 impeccable 絕對禁令）

side-stripe 色條、gradient text、裝飾性 glass、hero-metric 模板、千篇一律卡片網格、每段 eyebrow、01/02/03 編號、文字溢出容器。漫畫紋理是 background-layer，不可變成 side-stripe 或 gradient text。
