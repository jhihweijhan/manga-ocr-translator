# WebUI 圖片翻譯技術規格（含 proposed 多頁/串流設計）

## Context

目前專案是空白起點，已建立領域詞彙表與 ADR。核心行為見 [PRODUCT.md](./PRODUCT.md)，領域語言見 [CONTEXT.md](../CONTEXT.md)。

相關決策：

1. [0001 Use Structured Model Results](./adr/0001-structured-model-results.md)
2. [0002 Translate Text Blocks Together](./adr/0002-translate-blocks-together.md)
3. [0003 Reject Invalid Model JSON](./adr/0003-reject-invalid-model-json.md)
4. [0004 Use Complete Model Responses](./adr/0004-use-complete-model-responses.md)
5. [0005 Proxy Ollama Through a Local Backend](./adr/0005-proxy-ollama-through-local-backend.md)
6. [0006 Use FastAPI for the Local Backend](./adr/0006-use-fastapi-backend.md)
7. [0007 Use React, Vite, and TypeScript for the WebUI](./adr/0007-use-react-vite-typescript.md)
8. [0008 Do Not Persist Uploaded Images](./adr/0008-do-not-persist-uploaded-images.md)
9. [0009 Externalize Prompts as TOML](./adr/0009-externalize-prompts-as-toml.md)
10. [0010 Text Region Detection](./adr/0010-text-region-detection.md) - Proposed（尚未實作）
11. [0011 Stream Progress With Complete Results](./adr/0011-stream-progress-with-complete-results.md) - Proposed（尚未實作）
12. [0012 Multi-page Reading Task](./adr/0012-multi-page-reading-task.md) - Proposed（尚未實作）

Context7 查詢確認：

1. Ollama 本機模型清單可由 `GET /api/tags` 讀取，預設本機服務為 `localhost:11434`。Ollama 也支援完整回應、結構化 JSON schema 輸出，以及 `/api/generate` 的 NDJSON streaming；streaming chunk 會帶 `response` 片段，最後 `done: true` chunk 才代表完成，streaming 中途錯誤可能以 NDJSON `error` 物件出現。
2. FastAPI 提供 `UploadFile` 處理 multipart 檔案上傳，適合現行 `/api/ocr` 圖片請求；依 ADR 0011 尚未實作的 proposed `/api/ocr/stream` 可使用 `StreamingResponse` 與 `text/event-stream`，不需要新增依賴。
3. Vite React TypeScript 官方模板使用 `@vitejs/plugin-react`，dev server 可設定 `/api` proxy 指向本機後端。

## Proposed Changes

### Repository shape

```text
backend/
frontend/
docs/
  PRODUCT.md
  TECH.md
  adr/
CONTEXT.md
prompts.toml.example
```

根目錄建立 Python `pyproject.toml` 時，依專案指示使用 `uv` 管理後端環境。前端由 `frontend/` 內的 npm package 管理。

### Backend

後端使用 Python FastAPI，放在 `backend/`。主要責任：

1. 提供 WebUI API。
2. 代理本機 Ollama 呼叫。
3. 驗證上傳限制與模型回應結構。
4. 每次 OCR 或翻譯請求重新讀取提示詞設定。
5. 正規化錯誤回應，讓前端能區分模型清單、OCR、翻譯、提示詞、逾時與取消相關錯誤。
6. 現行以單張圖片為處理單位；依 ADR 0012，尚未實作的多頁閱讀任務會讓頁序、頁清單、佇列與 archive 展開由前端管理，後端不建立多頁任務狀態。

建議模組：

```text
backend/app/main.py
backend/app/settings.py
backend/app/prompts.py
backend/app/ollama_client.py
backend/app/schemas.py
backend/app/routes/models.py
backend/app/routes/ocr.py
backend/app/routes/translate.py
```

`settings.py` 管理預設 Ollama 位址、上傳大小、逾時預設值。請求可帶入 Ollama 位址與逾時覆寫。

`prompts.py` 管理 `prompts.toml` 讀取、內建預設、TOML 錯誤與有效提示詞回傳。每次 OCR 或翻譯請求都重新讀取，不能在啟動時快取成唯一來源。

`ollama_client.py` 封裝：

1. `GET {ollama_base_url}/api/tags`
2. `POST {ollama_base_url}/api/generate` OCR 模型呼叫
3. `POST {ollama_base_url}/api/generate` 翻譯模型呼叫

現行 JSON 端點使用完整非串流回應：`/api/ocr` 與 `/api/translate` 仍是 WebUI 主流程，並維持 ADR 0004。依 ADR 0011，尚未實作的進度串流端點可使用 Ollama streaming 取得進度，但仍必須累積完整 `response` 後才解析與驗證結果。呼叫端必須設定逾時，預設 120 秒。

後端應使用 `httpx` 或等價 async HTTP client 呼叫 Ollama。若 FastAPI request 斷線或前端取消，後端應取消 upstream Ollama HTTP request。

依 ADR 0012，尚未實作的多頁閱讀任務不新增後端持久化 API。提案中的前端會依頁清單逐頁呼叫 OCR 與翻譯端點；若 ADR 0011 也已落地，可使用 `/api/ocr/stream` 與 `/api/translate/stream`。每次請求只包含目前頁圖片與目前頁文字區塊。這讓 ADR 0008 的圖片不落地決策保持清楚：後端只在單次 request 生命週期內讀取圖片，不保存整本書、頁面 Blob 或 task history。

### Page source normalization

本節依 ADR 0012 描述尚未實作的 proposed 多頁來源正規化。現行 WebUI 仍以單張圖片輸入為主。提案中的前端會在開始 OCR 前先把使用者輸入正規化成 `ReadingTask`：

```ts
type ReadingTask = {
  taskId: string;
  sourceKind: "single_file" | "multi_file" | "folder" | "archive";
  pages: ReadingPage[];
  createdAt: string;
};

type ReadingPage = {
  pageId: string;
  index: number;
  filename: string;
  relativePath: string | null;
  displayPath: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  sizeBytes: number;
  blob: Blob | null;
  objectUrl: string | null;
  status: PageState;
  blocks: TextBlock[];
  translations: Record<string, string>;
  prompts: PagePrompts | null;
  error: ApiErrorEnvelope["error"] | null;
};
```

`pageId` 由正規化後的排序位置與穩定 path seed 產生，例如 `page-0001`、`page-0002`。它只需要在目前閱讀任務內唯一；匯出時以 `page_id` 保存。頁內 `block_id` 可以維持 `/api/ocr` 回傳的 `block-1` 形狀。v2 export/import wire format 永遠使用頁內 `block_id`；若前端內部需要全域查找 key，使用 `${pageId}#${blockId}`，但此 namespaced key 不寫入 `pages[].translations`。

輸入規則：

1. 單檔與多檔：使用瀏覽器 File API 取得 `File`，只接受 PNG、JPEG、WebP。多檔以 `file.name` 排序。
2. 資料夾：使用瀏覽器提供的相對路徑，例如 `webkitRelativePath`。正規化路徑分隔符為 `/`，移除空 path segment，拒絕包含 NUL、絕對路徑或 `..` 的項目。
3. CBZ/ZIP：proposed，尚未實作；在目前瀏覽器工作階段中展開 archive manifest，先驗證所有限制，再產生頁面 Blob/object URL。CBZ 視為 ZIP container，副檔名只影響來源標籤，不改排序規則。

排序規則：

1. 忽略資料夾 entry、`__MACOSX` 內所有項目、任一路徑 segment 以 `.` 開頭的隱藏檔或隱藏目錄。
2. 只接受副檔名與 magic bytes 都符合 PNG、JPEG 或 WebP 的項目；副檔名大小寫不敏感。
3. path 以 `/` 分段做 case-insensitive natural sort；數字片段以數值比較，非數字片段以 locale-stable byte order 比較。
4. 若 natural sort 視為相同，使用原始正規化 path 作 tie-breaker，確保排序穩定。

建議初始限制以設定常數表示：

```text
MAX_PAGE_COUNT = 200
MAX_PAGE_BYTES = 10 MB
MAX_TOTAL_IMAGE_BYTES = 512 MB
MAX_ARCHIVE_BYTES = 512 MB
MAX_ARCHIVE_COMPRESSION_RATIO = 20
```

ZIP/CBZ 在實作前維持 non-goal/proposed。若未來落地，超出任一限制、含 path traversal、含絕對路徑、含加密 entry、含不支援壓縮方法，或 archive manifest 無法完整讀取時，應拒絕整個 archive。不要只略過問題項目後繼續，避免頁序與使用者預期不同。

### Backend API

`GET /api/models`

Query:

```text
base_url: string, optional, default http://127.0.0.1:11434
timeout_seconds: number, optional
```

Response:

```json
{
  "models": [
    {
      "name": "glm-ocr:latest",
      "model": "glm-ocr:latest",
      "modified_at": "...",
      "size": 123,
      "details": {}
    }
  ]
}
```

`GET /api/prompts`

回傳目前有效提示詞內容與來源。若 `prompts.toml` 不存在，回傳內建預設。若 TOML 格式錯誤，回傳錯誤狀態。

```json
{
  "source": "toml",
  "ocr": {
    "system": "...",
    "user": "..."
  },
  "translation": {
    "system": "...",
    "user": "..."
  }
}
```

`POST /api/ocr`

multipart form data:

```text
image: file
ollama_base_url: string
ocr_model: string
source_language_hint: string
timeout_seconds: number
```

Response:

```json
{
  "blocks": [
    {
      "id": "block-1",
      "source_text": "原文",
      "confidence": null,
      "position": null
    }
  ],
  "prompt": {
    "source": "toml",
    "system_template": "...",
    "user_template": "...",
    "rendered_system": "...",
    "rendered_user": "..."
  },
  "raw_model": {
    "model": "glm-ocr:latest"
  }
}
```

`POST /api/translate`

JSON body:

```json
{
  "ollama_base_url": "http://127.0.0.1:11434",
  "translation_model": "qwen3:latest",
  "source_language_hint": "自動判斷",
  "target_language": "繁體中文",
  "timeout_seconds": 120,
  "blocks": [
    {
      "id": "block-1",
      "source_text": "原文",
      "confidence": null,
      "position": null
    }
  ]
}
```

Response:

```json
{
  "translations": [
    {
      "block_id": "block-1",
      "translated_text": "繁中譯文"
    }
  ],
  "prompt": {
    "source": "toml",
    "system_template": "...",
    "user_template": "...",
    "rendered_system": "...",
    "rendered_user": "..."
  },
  "raw_model": {
    "model": "qwen3:latest"
  }
}
```

翻譯回應必須與輸入文字區塊一對一。後端應驗證翻譯數量、`block_id` 是否可對應；缺少 `block_id`、重複 `block_id`、未知 `block_id` 或數量不符時視為翻譯失敗。後端不得用 `source_text` 做主要對應，因為多個文字區塊可能有相同原文。前端顯示順序永遠依原始文字區塊順序。

`POST /api/ocr/stream`

依 ADR 0011，proposed，尚未實作；現行主流程仍是 `POST /api/ocr` 的完整回應（ADR 0004）。若落地，multipart form data 與 `POST /api/ocr` 相同。Response 使用 `text/event-stream`，前端以 `fetch` 讀取串流。此端點不使用 `EventSource`，因為 OCR 需要 POST multipart body，且第一版不建立後端任務歷史。

`POST /api/translate/stream`

依 ADR 0011，proposed，尚未實作；現行主流程仍是 `POST /api/translate` 的完整回應（ADR 0004）。若落地，JSON body 與 `POST /api/translate` 相同。Response 使用 `text/event-stream`，前端以 `fetch` 讀取串流。

proposed 串流事件格式：

```text
event: progress
data: {"stage":"ocr","message":"正在產生 OCR 回應","chunk_count":3,"elapsed_ms":1400}

event: result
data: {"stage":"ocr","payload":{"blocks":[...],"prompt":{...},"raw_model":{"model":"glm-ocr:latest"}}}
```

SSE wire format 使用 snake_case。前端可在解析後轉成 TypeScript state 使用的 camelCase。`progress` data 必須包含 `stage`、`message`、`chunk_count`、`elapsed_ms`。`result` data 必須包含 `stage` 與 `payload`；翻譯成功時的 `payload` 與 `POST /api/translate` response body 相同，OCR 成功時的 `payload` 與 `POST /api/ocr` response body 相同。串流期間發生錯誤時，最後一個 application event 必須是：

```text
event: error
data: {"error":{"code":"invalid_model_json","stage":"ocr","message":"Model response did not match the expected JSON schema.","details":{}}}
```

每個成功串流必須剛好送出一個 `result` 事件；每個後端可回報的失敗串流必須剛好送出一個 `error` 事件。`progress` 事件可以為零個或多個，內容只能描述非權威進度，例如階段、已收到的 Ollama chunk 數、已耗時、或目前正在等待模型；不得包含未驗證的模型文字、partial JSON、OCR block、翻譯文字或 `block_id` 對應結果。

若前端取消 `fetch` 或瀏覽器斷線，後端應停止 SSE response generator，取消 upstream Ollama streaming request，且不得再嘗試產生 `result` 或 `error` event 給已斷線的 client。取消語意仍由前端目前 `run_id` 與 `AbortController` 控制。

所有 API 錯誤使用統一 envelope：

```json
{
  "error": {
    "code": "invalid_model_json",
    "stage": "ocr",
    "message": "Model response did not match the expected JSON schema.",
    "details": {}
  }
}
```

`code` 至少包含 `ollama_unreachable`、`timeout`、`invalid_model_json`、`prompt_toml_invalid`、`image_too_large`、`unsupported_image_type`、`model_request_failed`。`stage` 至少包含 `models`、`prompts`、`ocr`、`translation`。

### Structured Ollama contracts

第一版明定使用 Ollama `POST /api/generate`，不使用 `/api/chat` 或 OpenAI-compatible endpoint。後端送出的 OCR request body：

```json
{
  "model": "glm-ocr:latest",
  "system": "rendered OCR system prompt",
  "prompt": "rendered OCR user prompt",
  "images": ["base64-image-without-data-url-prefix"],
  "format": {
    "type": "object",
    "properties": {}
  },
  "stream": false
}
```

後端送出的翻譯 request body：

```json
{
  "model": "qwen3:latest",
  "system": "rendered translation system prompt",
  "prompt": "rendered translation user prompt",
  "format": {
    "type": "object",
    "properties": {}
  },
  "stream": false
}
```

現行非串流端點送給 Ollama 的 `stream` 為 `false`。依 ADR 0011，尚未實作的串流進度端點會送 `stream: true`，並讀取 Ollama 回傳的 NDJSON chunks。每個含 `response` 欄位的 chunk 只能被累積為內部 buffer；後端不得把該片段當成可用 OCR/翻譯資料輸出給 WebUI。只有收到 final `done: true` chunk 後，後端才可解析累積後的完整 `response` 字串為 JSON。若 upstream chunk 含 `error`、HTTP 失敗、chunk 不是合法 JSON、stream 結束但從未收到 `done: true`、累積後的 `response` 不是合法 JSON、或不符合 schema，該階段失敗並以標準錯誤 envelope 結束串流。

OCR 階段要求模型輸出：

```json
{
  "blocks": [
    {
      "source_text": "原文",
      "confidence": null,
      "position": null
    }
  ]
}
```

`position` 可以是 `null` 或省略；缺失時不視為 OCR 失敗，現行程式也可維持 `position: null`。依 ADR 0010，尚未實作的 proposed normalized rectangle 若落地，`position` 必須符合：`type` 為 `rect`、`unit` 為 `ratio`、`x`/`y`/`width`/`height` 為有限數值，`x` 與 `y` 在 `0..1`，`width` 與 `height` 大於 `0`，且 `x + width <= 1`、`y + height <= 1`。不符合時視為 OCR `invalid_model_json`。

翻譯階段要求模型輸出：

```json
{
  "translations": [
    {
      "block_id": "block-1",
      "translated_text": "譯文"
    }
  ]
}
```

後端負責把模型輸出轉成應用內資料。模型 JSON 不合法、缺少必要欄位、陣列長度不符、譯文無法對應文字區塊時，該階段失敗。

### Prompt configuration

`prompts.toml` 第一版包含兩組全域提示詞：

```toml
[ocr]
system = "..."
user = "..."

[translation]
system = "..."
user = "..."
```

支援變數：

```text
{source_language_hint}
{target_language}
{json_schema}
{text_blocks}
```

第一版不支援 per-model prompt override。若日後某些模型需要不同 prompt，再以明確需求新增，不預留未使用分支。

提示詞設定檔名固定為 `prompts.toml`。應提供 `prompts.toml.example`，讓使用者知道可設定格式。應用程式本身有內建預設提示詞；WebUI 平時顯示有效提示詞模板與來源。每次 OCR 或翻譯 response 都應包含該次請求實際送出的 rendered prompt，匯出 JSON 也保存 rendered prompt。

### Frontend

前端使用 React + Vite + TypeScript，放在 `frontend/`。主要 UI 區塊：

1. 設定列：Ollama 位址、模型清單重新整理、逾時設定。
2. 模型與語言列：OCR 模型、翻譯模型、來源語言提示、目標語言。
3. 來源選取區：現行單檔；多檔、資料夾、CBZ/ZIP 依 ADR 0012 proposed，尚未實作。
4. 任務狀態與錯誤區。
5. 頁清單或縮圖列：依 ADR 0012 proposed，尚未實作；用於頁序、頁狀態、錯誤標記、目前頁。
6. 目前閱讀/校對視圖：現行圖片預覽與 OCR/譯文左右對照表；可選 overlay 依 ADR 0010 proposed，尚未實作。
7. 提示詞檢視區，只讀顯示有效 OCR 與翻譯提示詞。
8. 動作列：現行取消處理、重新處理、重新翻譯、匯出 JSON；重跑此頁依 ADR 0012 proposed，尚未實作。

建議前端狀態以明確 task state 表示：

```ts
type TaskState =
  | "idle"
  | "ready"
  | "ocr_running"
  | "ocr_failed"
  | "translation_running"
  | "translation_failed"
  | "completed"
  | "cancelled";

type PageState =
  | "queued"
  | "ocr_running"
  | "ocr_failed"
  | "translation_running"
  | "translation_failed"
  | "completed"
  | "cancelled";
```

依 ADR 0011，尚未實作的 proposed 串流進度會讓進度資訊與結果資料分開保存，避免 UI 把未驗證片段誤認成 OCR 或翻譯結果：

```ts
type TaskProgress = {
  stage: "ocr" | "translation";
  message: string;
  chunkCount: number;
  elapsedMs: number;
};

type StreamEvent =
  | { type: "progress"; progress: TaskProgress }
  | { type: "result"; stage: "ocr"; payload: OcrResponse }
  | { type: "result"; stage: "translation"; payload: TranslationResponse }
  | { type: "error"; error: ApiErrorEnvelope["error"] };
```

依 ADR 0011 proposed，進度 UI 顯示在任務狀態區，不放進 OCR/譯文對照表。建議顯示目前階段、最近一筆 progress message、已耗時與 chunk count；若尚未收到 progress，顯示既有處理中狀態。UI 不顯示 Ollama `response` 片段、不顯示 partial JSON，也不提前建立文字區塊或譯文列。

請求取消使用 `AbortController`。取消後前端進入 `cancelled`，保留圖片與設定，清除未完成階段結果。

前端每次 OCR、翻譯、重新處理或重新翻譯都建立唯一 `run_id`。現行前端只接受目前 `run_id` 的完整 API 回應；依 ADR 0011 proposed，串流事件也必須遵守同一規則，舊請求即使晚到也不得覆蓋目前畫面。取消 OCR 清空 `blocks`、`translations` 與 OCR progress；取消翻譯保留 `blocks`，清空未完成 `translations` 與翻譯 progress。

WebUI 的現行主要處理流程使用 `/api/ocr` 與 `/api/translate` 完整回應，這是 ADR 0004 的現行行為。依 ADR 0011，尚未實作的 proposed 處理流程可使用 `/api/ocr/stream` 與 `/api/translate/stream` 取得進度；streaming 端點落地時，最終成功 payload 必須與非串流端點保持一致。

依 ADR 0012，尚未實作的 proposed 多頁佇列由前端持有，第一版 `MAX_ACTIVE_PAGES = 1`。佇列流程：

1. 建立 `ReadingTask` 後，所有頁先進入 `queued`。
2. 選定模型與語言後，依 `pages[index]` 逐頁處理。
3. 每頁使用該頁 Blob 呼叫 OCR 端點；若 ADR 0011 已落地可呼叫 `/api/ocr/stream`，否則呼叫完整回應 `/api/ocr`。OCR result 驗證成功後，把 blocks 寫入該頁。
4. 若該頁 blocks 為空，該頁直接進入 `completed`，不呼叫翻譯。
5. 若 blocks 不為空，呼叫翻譯端點；若 ADR 0011 已落地可呼叫 `/api/translate/stream`，否則呼叫完整回應 `/api/translate`。翻譯 result 驗證成功後，把 translations 寫入該頁。
6. 單頁失敗只更新該頁 `error` 與 `PageState`，不得清除其他頁結果。使用者可選擇重跑該頁、跳到其他頁檢查，或從失敗頁繼續佇列。
7. 取消單頁時，前端 abort 目前頁的 active request，把該頁標為 `cancelled`，並把佇列暫停；後續 `queued` 頁不得自動開始。使用者明確選擇繼續佇列時，才從下一個 `queued` 頁繼續；若選擇重跑取消頁，該頁回到 `queued` 後先處理。
8. 取消整個佇列時，前端 abort 目前 active request，把目前頁與尚未開始的頁標為 `cancelled`，保留已完成頁結果，並清除 active queue runner。

依 ADR 0012 proposed，頁清單應提供穩定尺寸縮圖，縮圖來源為前端 session-only object URL。縮圖必須 lazy decode：只渲染目前可視頁附近的縮圖，不為整本書一次建立 decoded bitmap、canvas 或 ImageBitmap；目前頁以外不得長期持有 decoded canvas/bitmap。建議額外限制單頁 decoded pixel count，例如 `MAX_IMAGE_PIXELS = 32_000_000`，超過時拒絕該頁或 archive。切換來源、移除任務、匯入 JSON、archive 被拒絕或元件 unmount 時，必須 revoke 舊 object URL 並釋放縮圖/preview 暫存。

現行匯入 JSON 而沒有原圖 Blob 時，WebUI 顯示已匯入文字結果並停用需要圖片的重新處理。依 ADR 0012 proposed，多頁頁清單會改以檔名、相對路徑、頁狀態與文字摘要呈現；需要圖片的重新處理與 OCR 重跑需停用。若使用者選擇「重新連結圖片來源」，前端先把新來源正規化成候選頁清單，再完整比對既有匯入 pages：頁數必須相同；每頁優先以 `relative_path` 比對，缺少 `relative_path` 時以 `index` 加 `filename` 比對；mime type 與大小限制仍需通過。所有頁都匹配後才把 Blob/object URL 接到既有 pages；任一頁不匹配時拒絕整次連結，不得建立部分連結，也不得覆蓋 blocks、translations、prompts、page status 或 error。若匯入頁已有 blocks，重新翻譯仍可使用既有文字區塊。

使用瀏覽器 local storage 記住：

1. Ollama 位址
2. OCR 模型
3. 翻譯模型
4. 來源語言提示
5. 目標語言
6. 逾時設定

### Export JSON

前端產生匯出 JSON，不需要後端保存。現行單頁 v1 JSON 維持可匯入；依 ADR 0012，尚未實作的多頁閱讀任務使用 v2 JSON。所有版本都不得包含圖片 bytes、data URL、object URL 或後端檔案路徑。

單頁 v1 匯出資料包含：

```json
{
  "version": 1,
  "image": {
    "filename": "page.png"
  },
  "settings": {
    "ollama_base_url": "http://127.0.0.1:11434",
    "ocr_model": "glm-ocr:latest",
    "translation_model": "qwen3:latest",
    "source_language_hint": "自動判斷",
    "target_language": "繁體中文",
    "timeout_seconds": 120
  },
  "blocks": [
    {
      "block_id": "block-1",
      "source_text": "原文",
      "confidence": null,
      "position": null
    }
  ],
  "translations": {
    "block-1": "譯文"
  },
  "prompts": {
    "ocr": {
      "source": "toml",
      "system_template": "...",
      "user_template": "...",
      "rendered_system": "...",
      "rendered_user": "..."
    },
    "translation": {
      "source": "toml",
      "system_template": "...",
      "user_template": "...",
      "rendered_system": "...",
      "rendered_user": "..."
    }
  }
}
```

WebUI 可匯入先前匯出的 v1 JSON，並嚴格驗證欄位、版本、文字區塊、區塊譯文、設定與提示詞紀錄。匯入不還原圖片本體，也不建立後端任務歷史；匯入後若沒有原圖，前端維持無原圖提示並要求使用者重新選圖後才能重新處理。

`blocks` 的 v1 export/import shape：

```json
[
  {
    "block_id": "block-1",
    "source_text": "原文",
    "confidence": null,
    "position": null
  }
]
```

`position` 可為 `null`；依 ADR 0010，尚未實作的 proposed normalized rectangle 未來也可成為有效值。舊匯出若沒有位置資訊仍有效；新增位置資訊落地後，WebUI 匯出與匯入都應保留該值。`translations` 是以 `block_id` 為 key 的物件，例如 `{ "block-1": "譯文" }`；匯入時未知 `block_id` 或非字串譯文必須拒絕。

依 ADR 0012，尚未實作的 proposed 多頁 v2 export/import shape：

```json
{
  "version": 2,
  "task": {
    "source_kind": "archive",
    "page_count": 2
  },
  "settings": {
    "ollama_base_url": "http://127.0.0.1:11434",
    "ocr_model": "glm-ocr:latest",
    "translation_model": "qwen3:latest",
    "source_language_hint": "自動判斷",
    "target_language": "繁體中文",
    "timeout_seconds": 120
  },
  "pages": [
    {
      "page_id": "page-0001",
      "index": 0,
      "filename": "001.png",
      "relative_path": "chapter-1/001.png",
      "status": "completed",
      "blocks": [
        {
          "block_id": "block-1",
          "source_text": "原文",
          "confidence": null,
          "position": null
        }
      ],
      "translations": {
        "block-1": "譯文"
      },
      "prompts": {
        "ocr": {
          "source": "toml",
          "system_template": "...",
          "user_template": "...",
          "rendered_system": "...",
          "rendered_user": "..."
        },
        "translation": {
          "source": "toml",
          "system_template": "...",
          "user_template": "...",
          "rendered_system": "...",
          "rendered_user": "..."
        }
      },
      "error": null
    }
  ]
}
```

proposed v2 匯入規則：

1. `version` 必須為 `2`，`pages` 必須是非空陣列，`page_id` 在同一檔案內必須唯一。
2. `index` 必須從 `0` 開始且不得重複；匯入後顯示順序依 `index`，不是依目前檔名重新排序。
3. v2 JSON wire format 是 page-local：每頁 `translations` 只能包含同頁 `blocks[].block_id`，不得包含 `${page_id}#${block_id}` 這類前端內部全域 key。未知 `block_id`、namespaced key、非字串譯文或重複 page/block identity 必須拒絕。
4. `position` 驗證沿用 ADR 0010 proposed；無位置資訊仍有效。
5. v2 匯入不還原圖片本體。若 `blob` 與 `objectUrl` 為 `null`，WebUI 可顯示 OCR/譯文結果與頁清單，但不得允許重新處理、重新 OCR 或任何需要圖片的操作。使用者必須走「重新連結圖片來源」流程，且完整匹配成功後才可重新 OCR 或重新處理。若該頁已有 blocks，重新翻譯可使用匯入的文字區塊。

### Text region detection

依 ADR 0010，文字區域偵測與 overlay 是 proposed，尚未實作；現行程式可維持 `position: null`，核心流程不得依賴位置資訊，清單模式仍是相容且有效的主流程。第一階段不引入獨立文字區域偵測模組、開關、空介面或佔位實作。若未來 OCR 結構化結果提供 normalized rectangle 位置資訊，後端可驗證並保留，前端可用於圖片 overlay 對照；缺失時退回既有清單模式。若日後加入獨立文字區域偵測模組，應作為後續 ADR 與明確產品需求加入；若移除該模組，核心 OCR 與翻譯流程不能受影響。

## Testing and Validation

現行測試責任以單張圖片、完整回應 `/api/ocr` 與 `/api/translate`、v1 匯入/匯出為準。下列提到 ADR 0010/0011/0012 的項目是未來實作 proposed 功能時的驗收計畫，不代表目前已有對應功能碼或測試碼。

1. `PRODUCT.md` 行為 1-6：測試模型清單載入成功、失敗、手動重新整理、local storage 帶入與模型不存在時不帶入。

2. `PRODUCT.md` 行為 7-9：測試 PNG/JPEG/WebP 可上傳與預覽；超過 10 MB 或不支援格式會被前端阻擋，後端也必須拒收；同一時間只有一個閱讀任務。

3. `PRODUCT.md` 行為 10-11：測試來源語言提示與目標語言選項、預設值與記住設定。

4. `PRODUCT.md` 行為 12-16：以 mock Ollama 回應測試上傳後自動 OCR 再翻譯，結果表以文字區塊一列呈現。

5. `PRODUCT.md` 行為 17-20：測試修正原文後不自動翻譯；按重新翻譯只呼叫翻譯 API；按重新處理會呼叫 OCR 與翻譯 API。

6. `PRODUCT.md` 行為 21-22：測試處理中鎖定模型與設定；取消會 abort 請求並進入 `cancelled`；舊 `run_id` 回應不得覆蓋新任務。

7. `PRODUCT.md` 行為 23-26：測試 OCR 失敗不呼叫翻譯；翻譯失敗保留 OCR；無效 JSON 視為階段失敗。

8. ADR 0011 尚未實作；未來以 TDD tracer bullet 實作進度串流時，第一個後端整合測試應透過 public API 呼叫 `/api/ocr/stream`，mock Ollama 回傳多個 NDJSON `response` chunk，驗證 API 可先送出 `progress` event，最後只送出一個 `result` event，且 result payload 與 `/api/ocr` 的完整成功 response shape 相同。

9. ADR 0011 尚未實作；未來第二個後端整合測試呼叫 `/api/translate/stream`，mock Ollama chunk 逐段組成翻譯 JSON，驗證任何 `progress` event 不包含 partial model text、OCR block、譯文或 `block_id` 對應結果；只有最終 `result` event 經過完整 schema 與 `block_id` 驗證後才回傳譯文。

10. ADR 0011 尚未實作；未來第三個後端整合測試讓 mock Ollama streaming 中途送出 `{ "error": "..." }`、malformed NDJSON，或在只送出 `done:false` chunks 後關閉連線但沒有 final `done:true` chunk，驗證 stream 以單一 `error` event 結束，error data 使用標準 envelope，且不送出 `result` event。

11. ADR 0011 尚未實作；未來測試前端取消串流請求會 abort 目前 `fetch`，UI 進入 `cancelled`，舊 `run_id` 的後續 progress/result/error event 不得覆蓋目前畫面。後端測試應覆蓋 client disconnect 時 upstream Ollama streaming request 被取消。

12. `PRODUCT.md` 行為 30：測試逾時設定傳遞到後端，後端逾時時回傳可辨識錯誤。串流端點逾時是 ADR 0011 future acceptance，落地時也必須以標準 `error` event 結束。

13. `PRODUCT.md` 行為 31-34：測試 `prompts.toml` 存在、不存在、格式錯誤三種情境；WebUI 顯示有效提示詞內容與來源；格式錯誤會阻擋相關請求。

14. `PRODUCT.md` 行為 35-37：測試匯出 JSON/TXT 包含指定欄位且不包含圖片內容。

15. 後端單元測試：模型回應 JSON schema 驗證、翻譯數量對應、檔案大小限制、提示詞變數替換、TOML 錯誤。Ollama streaming chunk 累積器只在看見 final `done:true` 後回傳完整 buffer 給 schema validator 是 ADR 0011 future acceptance。

16. 後端整合測試：用 mock Ollama server 驗證 `/api/models`、`/api/ocr`、`/api/translate` 的成功與錯誤路徑，包含送到 Ollama 的 `/api/generate` request body、`stream` 值、`response` JSON 解析、錯誤 envelope、`block_id` 對應。`/api/ocr/stream`、`/api/translate/stream` 與 SSE event framing 是 ADR 0011 future acceptance。

17. 前端測試：使用 mock API 驗證狀態轉換、按鈕可用性、錯誤訊息、取消處理、重新翻譯、重新處理、匯出 JSON，以及取消或重新處理後的 race condition。串流 progress 顯示、progress 不建立結果列、`result` event 才更新 OCR/譯文、`error` event 進入失敗狀態是 ADR 0011 future acceptance。

18. 提示詞 parser/render 測試：驗證不存在、TOML 語法錯、缺 section、缺必要欄位、變數渲染、rendered prompt 匯出內容。

19. 手動驗證：啟動本機 Ollama，使用實際模型測試現行完整回應流程；至少驗證一個 vision OCR 模型與一個文字翻譯模型可透過 `/api/ocr`、`/api/translate` 完成單張圖片 OCR 與翻譯。ADR 0011 的進度訊息更新、stream cancel 與 upstream streaming cancel 屬未來驗收，不屬現行手動驗證。

20. ADR 0012 尚未實作；未來以 TDD tracer bullet 實作多頁閱讀任務時，第一個前端整合測試應透過公開 UI 選入三個圖片檔 `page-10.png`、`page-2.png`、`page-1.png`，驗證頁清單以 natural sort 顯示為 `page-1.png`、`page-2.png`、`page-10.png`，且按開始後只處理第一頁；第一頁完成翻譯後才開始第二頁。若 ADR 0011 已落地，可用 `/api/ocr/stream`，否則使用完整回應端點。

21. ADR 0012 尚未實作；未來測試資料夾與 ZIP/CBZ 正規化。輸入包含子目錄、大小寫副檔名、`__MACOSX`、隱藏檔、非圖片檔與 `001.webp`、`002.jpg`、`010.png` 時，公開 page-source normalization 介面應只產生可接受圖片頁，路徑排序穩定且可解釋。

22. ADR 0012 尚未實作；未來測試 archive 安全限制。ZIP/CBZ 超過頁數、單頁大小、總解壓影像大小、壓縮比限制，或包含 path traversal、絕對路徑、加密 entry、不支援壓縮方法時，應拒絕整個 archive，UI 顯示 archive 錯誤，不建立部分頁清單。

23. ADR 0012 尚未實作；未來測試逐頁佇列、取消語意與失敗隔離。mock API 讓第一頁完成、第二頁 OCR 失敗、第三頁尚未處理時，第一頁結果保留，第二頁顯示可重跑錯誤，第三頁維持 `queued` 或可繼續狀態；第二頁失敗不得清除第一頁 blocks/translations/prompts。另測取消第二頁時佇列暫停且第三頁不自動開始；使用者按繼續後才處理下一個 `queued` 頁。

24. ADR 0012 尚未實作；未來測試單頁重跑。使用者在第二頁修改 OCR 原文後按「重跑此頁翻譯」，只呼叫該頁翻譯端點，不重跑其他頁 OCR/翻譯；整本「重新翻譯」才依頁序逐頁呼叫翻譯。

25. ADR 0012 尚未實作；未來測試跨頁 `block_id` namespace 與 v2 匯出。兩頁都含 `block-1` 時，頁內 translations 仍可用 `block-1`，v2 匯出也必須保持 page-local；前端全域查找可用 internal `${pageId}#${blockId}`，但不得寫入 JSON。v2 匯入若某頁 translations 指向不存在的 `block_id` 或包含 namespaced key 必須拒絕。

26. ADR 0012 尚未實作；未來測試 v1/v2 匯入與重新連結圖片來源。v1 單頁 JSON 仍可匯入；v2 多頁 JSON 匯入後不含圖片 Blob/object URL 時，可以檢視與校對文字結果；若頁面已有 blocks，可重新翻譯；重新處理與 OCR 重跑停用。重新連結來源時，只有頁數、`relative_path` 或 `index + filename` 全部匹配才接回 Blob/object URL；匹配失敗不得建立部分連結，也不得覆蓋匯入結果。

27. ADR 0012 尚未實作；未來測試記憶體控制。建立頁面 object URL 後，移除任務、匯入其他 JSON、重新選擇來源或 unmount 時應 revoke 舊 object URL；archive 被拒絕時不得留下可導航頁面或未釋放 object URL。頁清單縮圖必須 lazy render，只解碼目前可視範圍附近頁面；切換頁面時釋放非目前頁 decoded canvas/bitmap；超過 decoded pixel count 限制的頁面或 archive 必須被拒絕。

28. ADR 0012 尚未實作；未來手動驗證多頁時，使用實際瀏覽器依序測試多檔、資料夾、CBZ、ZIP。至少準備一組含 `1.png`、`2.png`、`10.png`、子目錄、隱藏檔、`__MACOSX` 與非圖片檔的來源，確認頁序、縮圖、頁間導航、逐頁進度、取消、失敗頁重跑、v2 JSON 匯出與不含圖片 bytes。

## Risks and Mitigations

1. Ollama 模型能力不可由 `/api/tags` 穩定判斷。緩解方式是不自動過濾模型，並在階段失敗時顯示明確錯誤。

2. 本機模型可能無法嚴格遵守 JSON schema。緩解方式是後端嚴格驗證，不做寬鬆修復，讓使用者調整 prompt 或換模型。

3. OCR 模型可能不支援來源語言提示。緩解方式是把它設計為提示而非硬性設定。

4. 大圖片或首次載入模型可能很慢。緩解方式是 10 MB 上傳限制、120 秒可設定逾時、取消處理。

5. 提示詞外部化可能造成錯誤 TOML。緩解方式是提供 `prompts.toml.example`、顯示有效提示詞來源、格式錯誤時讓請求明確失敗。

6. ADR 0011 proposed 串流端點未來可能讓使用者誤以為 partial model text 已可用。緩解方式是 progress event 僅允許非權威 metadata，最終 OCR/翻譯資料只能出現在 validated `result` event。

7. ADR 0011 proposed POST SSE 不能用瀏覽器原生 `EventSource` 直接送出既有 request body。緩解方式是前端使用 `fetch` + `ReadableStream` 解析 `text/event-stream`，不新增 client 或 server 依賴，也不建立後端任務歷史。

8. ADR 0012 proposed 多頁輸入未來可能讓使用者誤以為系統在背景保存整本書。緩解方式是由前端持有 session-only Blob/object URL，後端只處理目前頁請求，匯出 JSON 永遠不包含圖片 bytes。

9. ADR 0012 proposed ZIP/CBZ 未來可能造成壓縮炸彈或路徑 traversal。緩解方式是在建立頁清單前驗證 manifest、頁數、大小、壓縮比、路徑與壓縮方法，違規時拒絕整個 archive。ZIP/CBZ 在實作前維持 non-goal/proposed。

10. ADR 0012 proposed 多頁 `block_id` 未來可能跨頁衝突。緩解方式是翻譯 API 維持頁內對應，前端全域引用與匯出使用 `page_id` namespace。

11. ADR 0012 proposed 大量頁面縮圖未來可能造成瀏覽器記憶體壓力。緩解方式是限制頁數、總圖片 bytes 與 decoded pixel count，頁清單使用 lazy/virtualized rendering，只解碼可視頁附近縮圖，並在移除任務、重新選來源或卸載元件時 revoke object URL 與釋放 decoded bitmap/canvas。
