# 貢獻指南

本專案是一個 local-first 的漫畫翻譯 WebUI。請先確認變更沒有推翻 `docs/PRODUCT.md`、`docs/adr/` 與 `CONTEXT.md` 定義的產品行為、架構決策與領域用語。

## 開發環境

### 後端

後端使用 Python 3.12+、FastAPI 與 `uv` 管理環境。請在 repo root 執行後端指令。

```bash
uv sync
uv run uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

### 前端

前端位於 `frontend/`，使用 React、Vite、TypeScript 與純 CSS。請勿新增前端框架或 UI 套件，除非對應 issue 或 ADR 明確允許。

```bash
cd frontend
npm install
npm run dev
```

### Ollama 前置

本專案透過本機後端代理呼叫本機 Ollama。開始翻譯任務前，請先確認 Ollama 服務可用並已安裝需要的 OCR 模型與翻譯模型。

```bash
ollama serve
ollama pull gemma3:latest
ollama pull qwen3:latest
```

預設 Ollama 位址是 `http://127.0.0.1:11434`。WebUI 會透過後端讀取模型清單。

## 提交前驗證

前端變更至少執行：

```bash
cd frontend && npx tsc -b && npm test && npm run build
```

後端變更至少執行：

```bash
uv run pytest
uv run ruff check backend
```

repo root 的 `uv run ruff check` 可能會掃到本機未追蹤的技能檔，例如 `.agents/skills/` 內的個人代理工具，因此不適合作為提交前唯一依據。後端 lint 請以 `uv run ruff check backend` 作為必要檢查。

文件或 template 變更仍應跑對應的 `git diff --check -- <paths>`，避免尾端空白與格式噪音。

## 產品與 ADR 流程

變更前先讀：

- `CONTEXT.md`：使用一致的領域用語，例如「翻譯任務」、「文字區塊」、「區塊譯文」、「修正原文」、「重新處理」。
- `docs/PRODUCT.md`：確認行為、目標與非目標。
- `docs/adr/`：確認已接受的架構決策。

若變更會影響下列任一項，請先新增或更新 `docs/adr/` 與 `docs/PRODUCT.md`，並在 PR 說明取捨：

- 架構邊界，例如瀏覽器、FastAPI 後端、Ollama 代理責任。
- 非目標，例如批次、任務歷史、圖片持久化、嵌字回圖、匯入 JSON。
- 隱私或持久化，例如是否保存上傳圖片、結果或任務歷史。
- strict JSON 行為，例如模型 JSON 驗證、`block_id` 對應、是否允許寬鬆修復。
- 提示詞設定，例如 `prompts.toml`、每次請求重讀、WebUI 顯示有效提示詞。
- 取消處理與 upstream Ollama request 的生命週期。
- `position` 可為 `null` 的文字區塊處理方式。

不要在實作中默默推翻 ADR 或 non-goal。

## Issue triage labels

本 repo 的 issue tracker 使用 GitHub Issues。標籤語意需對齊 `docs/agents/triage-labels.md` 與 GitHub labels。

- `needs-triage`：維護者尚未判斷範圍、優先級或可執行性。
- `needs-info`：等待回報者補環境、重現步驟、截圖、logs 或驗證結果。
- `ready-for-agent`：需求足夠明確，可交給代理或非同步貢獻者執行。
- `ready-for-human`：需要維護者或人工產品判斷，不適合直接交給代理。
- `wontfix`：已決定不處理，通常是違反 non-goal、ADR 或專案方向。
輔助標籤：

- `good first issue`：範圍小、驗收清楚、風險低，適合新貢獻者。通常可和 `ready-for-agent` 或 `documentation` 搭配。

標籤調整應以 issue 內容為準。若 issue 會改變產品規格或 ADR，先補規格文件，再標成可執行。

## PR 要求

PR 說明應包含：

- linked issues。
- 行為改變與使用者可見影響。
- ADR / Product impact，若無影響也請明確寫「無」。
- 截圖、smoke test 或真實操作證據，尤其是 WebUI 變更。
- 實際執行過的測試指令與結果。
- 風險與 rollback 方式。

請保持變更範圍集中。不要把 unrelated formatting、README 重寫、label 操作或工具生成檔混進同一個 PR。
