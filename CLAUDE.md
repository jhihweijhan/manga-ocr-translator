# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

Local-first 漫畫 OCR 翻譯器。使用者上傳單張圖片 → 後端代理本機 Ollama 做 OCR 抽出文字區塊 → 再呼叫翻譯模型把每個文字區塊翻成目標語言。所有模型推論都跑在使用者本機的 Ollama，後端只是 proxy + 驗證層。

## 常用指令

```bash
# Backend (uv 管理環境，requires-python >=3.12)
uv run uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000

# Backend 測試 / lint
uv run pytest                              # 全部後端測試
uv run pytest backend/tests/test_ocr_api.py::test_name   # 單一測試
uv run ruff check                          # lint (line-length 100, py312)
uv run ruff format

# Frontend
cd frontend && npm install && npm run dev  # dev server，/api proxy 到 :8000
cd frontend && npm test                    # vitest run
cd frontend && npm run build               # tsc -b && vite build
cd frontend && npm run lint                # eslint
```

Frontend dev server 透過 Vite proxy 把 `/api` 轉給 `http://127.0.0.1:8000`，所以後端要先啟動。

## 架構

### 三層
- `backend/app/` — FastAPI，純 proxy + 驗證，不持久化任何資料（圖片不落地，見 ADR 0008）。
- `frontend/src/App.tsx` — 單檔 React 19 + TS 應用（~1100 行），所有 UI 狀態與 API 呼叫都在這裡。
- Ollama (`localhost:11434`) — 使用者自行安裝，後端用 `/api/generate`（非 `/api/chat`）呼叫。

### Backend 模組職責
- `routes/models.py` — `GET /api/models` 代理 Ollama `/api/tags`；定義 `DEFAULT_OLLAMA_BASE_URL` 與 `DEFAULT_TIMEOUT_SECONDS=120`，其他 route 從這裡 import。
- `routes/ocr.py` — `POST /api/ocr`（multipart）。驗證圖片型別（magic bytes，非只看 content-type）、10MB 上限，呼叫 OCR 模型，解析結構化 JSON 成 `block-{n}`。
- `routes/translate.py` — `POST /api/translate`（JSON）。一次送出所有文字區塊（見 ADR 0002），嚴格驗證譯文與輸入區塊一對一。
- `routes/prompts.py` — `GET /api/prompts`，並提供 `get_prompt_file_path` dependency（指向 cwd 的 `prompts.toml`）。
- `ollama_client.py` — httpx async client，把 httpx 例外分類成 `OllamaTimeoutError` / `OllamaConnectionError` / `OllamaRequestError` / `OllamaInvalidResponseError`。
- `api_errors.py` — `api_error()` 產生統一錯誤 envelope；`main.py` 的 exception handler 確保所有錯誤都符合該格式。

### 關鍵不變量（破壞這些會違反 ADR / PRD，動之前先確認）
- **嚴格 JSON，不做寬鬆修復**：模型回應不符 schema 即視為該階段失敗，不嘗試 best-effort parsing（ADR 0003）。
- **錯誤 envelope 統一格式**：`{"error": {"code", "stage", "message", "details"}}`。`code` ∈ {`ollama_unreachable`, `timeout`, `invalid_model_json`, `prompt_toml_invalid`, `image_too_large`, `unsupported_image_type`, `model_request_failed`, `client_disconnected`, `invalid_request`}；`stage` ∈ {`models`, `prompts`, `ocr`, `translation`}。
- **翻譯區塊對應靠 `block_id`，不靠 `source_text`**（多區塊可能同原文）。缺少/重複/未知 `block_id` 或數量不符 → 翻譯失敗。顯示順序永遠依輸入區塊順序。
- **Prompt 每次請求重讀**：`load_prompt_templates()` 每次 OCR/translate 都讀 `prompts.toml`，不在啟動時快取。檔案不存在 → 用 `BUILTIN_PROMPTS`；TOML 壞掉 → `prompt_toml_invalid`。
- **Prompt 變數**：`{source_language_hint}`, `{target_language}`, `{json_schema}`, `{text_blocks}`，以 `str.format` 渲染。每個 response 都回傳實際送出的 rendered prompt，匯出 JSON 也保存。
- **Client 斷線取消 upstream**：OCR/translate 用 `generate_*_with_disconnect_watch` 輪詢 `request.is_disconnected()`，斷線時 cancel 掉 Ollama 請求並回 `499 client_disconnected`。
- **位置資訊可為 null**：核心流程不得依賴 `position`；第一版無文字區域偵測模組。

### Prompt mode（auto / direct / prompted）
OCR 與翻譯都支援 prompt mode。`direct` 模式繞過 `prompts.toml`：OCR 直接送固定 prompt + 圖片並把回應純文字依空行切 block；翻譯直接送原文不帶 schema。`auto` 模式下 OCR 對 `glm-ocr` 模型自動走 `direct`，其餘走 `prompted`。

### Frontend 狀態機
`App.tsx` 用顯式 `TaskState`（`idle` → `ready` → `ocr_running` → … → `completed` / `*_failed` / `cancelled`）。每次處理建唯一 `run_id`，只接受當前 run_id 的回應避免 race；取消用 `AbortController`。設定（Ollama 位址、模型、語言、逾時）存 localStorage（key `manga-ocr-translator-settings`，version 2）。`DebuggableError` 攜帶錯誤 envelope 的 `details` 供 UI 顯示 raw model 輸出。

## 文件與工作流程
- `AGENTS.md` — 專案級 agent 指示（一律繁中回應、uv 環境、`docker compose`、用 context7 查套件、計畫性任務需協同討論）。
- 領域語言看根目錄 `CONTEXT.md`，命名請用其詞彙、避開它列的 _Avoid_ 同義詞。
- 架構決策在 `docs/adr/`；產品行為規格在 `docs/PRODUCT.md`，技術規格在 `docs/TECH.md`。輸出若與 ADR 衝突要明講，不要默默推翻。
- Issue / PRD 都在 GitHub Issues（`jhihweijhan/manga-ocr-translator`），用 `gh` CLI 操作。Triage labels：`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`。
