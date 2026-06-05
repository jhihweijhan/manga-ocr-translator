# WebUI 圖片翻譯技術規格

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

Context7 查詢確認：

1. Ollama 本機模型清單可由 `GET /api/tags` 讀取，預設本機服務為 `localhost:11434`。Ollama 也支援完整回應與結構化 JSON schema 輸出。
2. FastAPI 提供 `UploadFile` 處理 multipart 檔案上傳，適合 `/api/ocr`。
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

第一版使用完整非串流回應。呼叫端必須設定逾時，預設 120 秒。

後端應使用 `httpx` 或等價 async HTTP client 呼叫 Ollama。若 FastAPI request 斷線或前端取消，後端應取消 upstream Ollama HTTP request。

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

後端只解析 Ollama 回應中的 `response` 欄位為 JSON。若 `response` 不是合法 JSON 或不符合 schema，該階段失敗。

OCR 階段要求模型輸出：

```json
{
  "blocks": [
    {
      "source_text": "原文",
      "confidence": null
    }
  ]
}
```

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
3. 上傳與圖片預覽區。
4. 任務狀態與錯誤區。
5. OCR/譯文左右對照表。
6. 提示詞檢視區，只讀顯示有效 OCR 與翻譯提示詞。
7. 動作列：取消處理、重新處理、重新翻譯、匯出 JSON。

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
```

請求取消使用 `AbortController`。取消後前端進入 `cancelled`，保留圖片與設定，清除未完成階段結果。

前端每次 OCR、翻譯、重新處理或重新翻譯都建立唯一 `run_id`。前端只接受目前 `run_id` 的回應；舊請求即使晚到，也不得覆蓋目前畫面。取消 OCR 清空 `blocks` 與 `translations`；取消翻譯保留 `blocks` 並清空未完成 `translations`。

使用瀏覽器 local storage 記住：

1. Ollama 位址
2. OCR 模型
3. 翻譯模型
4. 來源語言提示
5. 目標語言
6. 逾時設定

### Export JSON

前端產生匯出 JSON，不需要後端保存。匯出資料包含：

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
  "blocks": [],
  "translations": [],
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

第一版不提供匯入。

### Text region detection

第一版不建立文字區域偵測模組、開關、空介面或佔位實作。文字區塊的 `position` 可為 `null`，核心流程不得依賴位置資訊。若日後加入文字區域偵測，應作為獨立模組與明確產品需求加入；若移除該模組，核心 OCR 與翻譯流程不能受影響。

## Testing and Validation

1. `PRODUCT.md` 行為 1-6：測試模型清單載入成功、失敗、手動重新整理、local storage 帶入與模型不存在時不帶入。

2. `PRODUCT.md` 行為 7-8：測試 PNG/JPEG/WebP 可上傳與預覽；超過 10 MB 或不支援格式會被前端阻擋，後端也必須拒收；同一時間只有一個任務。

3. `PRODUCT.md` 行為 9-10：測試來源語言提示與目標語言選項、預設值與記住設定。

4. `PRODUCT.md` 行為 11-14：以 mock Ollama 回應測試上傳後自動 OCR 再翻譯，結果表以文字區塊一列呈現。

5. `PRODUCT.md` 行為 15-18：測試修正原文後不自動翻譯；按重新翻譯只呼叫翻譯 API；按重新處理會呼叫 OCR 與翻譯 API。

6. `PRODUCT.md` 行為 19-20：測試處理中鎖定模型與設定；取消會 abort 請求並進入 `cancelled`；舊 `run_id` 回應不得覆蓋新任務。

7. `PRODUCT.md` 行為 21-24：測試 OCR 失敗不呼叫翻譯；翻譯失敗保留 OCR；無效 JSON 視為階段失敗；完整回應後才更新結果。

8. `PRODUCT.md` 行為 25：測試逾時設定傳遞到後端，後端逾時時回傳可辨識錯誤。

9. `PRODUCT.md` 行為 26-29：測試 `prompts.toml` 存在、不存在、格式錯誤三種情境；WebUI 顯示有效提示詞內容與來源；格式錯誤會阻擋相關請求。

10. `PRODUCT.md` 行為 30-31：測試匯出 JSON 包含指定欄位且不包含圖片內容。

11. 後端單元測試：模型回應 JSON schema 驗證、翻譯數量對應、檔案大小限制、提示詞變數替換、TOML 錯誤。

12. 後端整合測試：用 mock Ollama server 驗證 `/api/models`、`/api/ocr`、`/api/translate` 的成功與錯誤路徑，包含送到 Ollama 的 `/api/generate` request body、`response` JSON 解析、錯誤 envelope、`block_id` 對應。

13. 前端測試：使用 mock API 驗證狀態轉換、按鈕可用性、錯誤訊息、取消處理、重新翻譯、重新處理、匯出 JSON，以及取消或重新處理後的 race condition。

14. 提示詞 parser/render 測試：驗證不存在、TOML 語法錯、缺 section、缺必要欄位、變數渲染、rendered prompt 匯出內容。

15. 手動驗證：啟動本機 Ollama，使用實際模型測試完整流程；至少驗證一個 vision OCR 模型與一個文字翻譯模型。

## Risks and Mitigations

1. Ollama 模型能力不可由 `/api/tags` 穩定判斷。緩解方式是不自動過濾模型，並在階段失敗時顯示明確錯誤。

2. 本機模型可能無法嚴格遵守 JSON schema。緩解方式是後端嚴格驗證，不做寬鬆修復，讓使用者調整 prompt 或換模型。

3. OCR 模型可能不支援來源語言提示。緩解方式是把它設計為提示而非硬性設定。

4. 大圖片或首次載入模型可能很慢。緩解方式是 10 MB 上傳限制、120 秒可設定逾時、取消處理。

5. 提示詞外部化可能造成錯誤 TOML。緩解方式是提供 `prompts.toml.example`、顯示有效提示詞來源、格式錯誤時讓請求明確失敗。
