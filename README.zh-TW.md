# 漫畫翻譯神器

![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-frontend-61DAFB?logo=react&logoColor=111111)
![Ollama](https://img.shields.io/badge/Ollama-local_models-000000?logo=ollama&logoColor=white)
![Status](https://img.shields.io/badge/status-alpha-orange)

<!-- README-I18N:START -->

[English](./README.md) | **繁體中文**

<!-- README-I18N:END -->

漫畫翻譯神器是一個 local-first 工具，用來把單張漫畫圖片轉成可編輯的 OCR 文字區塊與翻譯草稿。它由 FastAPI backend、React/Vite frontend 組成，並使用你本機 Ollama server 提供的模型。

## 價值主張

當你想快速校對漫畫分鏡文字，但不想建立託管式處理流程時，可以使用這個工具。上傳一張圖片、執行 OCR、編輯偵測到的文字、翻譯區塊，最後複製或匯出文字接到下一步工作流程。

這個 app 以小型、可檢查的執行流程為目標：你可以選擇 Ollama endpoint、挑選 OCR 與翻譯模型、檢查原始文字，並掌握涉及的本機服務。

## 截圖與 Demo

在 UI 穩定前，截圖與 demo 媒體先保留為明確佔位：

| 資產 | 佔位 |
| --- | --- |
| 主畫面 | 請在 `docs/assets/readme/main-screen.png` 加入截圖。 |
| OCR 與校對流程 | 請在 `docs/assets/readme/ocr-proofreading-demo.gif` 加入 demo GIF。 |

## 特色

- 單張漫畫圖片 OCR，並產生可編輯文字區塊。
- 從本機 Ollama 模型清單分別選擇 OCR 與翻譯模型。
- 依 OCR 區塊順序輸出翻譯結果。
- 校對 OCR 原文後可重新翻譯，不需要重跑 OCR。
- 支援單段翻譯複製、全部複製與純譯文 TXT 匯出。
- 支援匯出與匯入 task JSON，以還原文字區塊、區塊譯文、模型選擇、語言設定與提示詞設定。
- 可檢視 prompt template，確認 OCR 與翻譯 request 的組成方式。
- Ollama 無法連線時提供第一次使用引導。
- 本機開發 stack 使用 FastAPI、React、Vite、Vitest、pytest 與 uv。

## 目前限制

- 已實作流程一次處理一張圖片；多頁閱讀任務、多張圖片批次、CBZ 與 ZIP 仍是 [ADR 0012](./docs/adr/0012-multi-page-reading-task.md) 的提案，尚未支援。
- 串流進度仍是 [ADR 0011](./docs/adr/0011-stream-progress-with-complete-results.md) 的提案，現行 app 會等待完整 OCR 與翻譯結果。
- 尚未實作 on-image overlay 或把譯文嵌回圖片。[ADR 0010](./docs/adr/0010-text-region-detection.md) 只提議未來支援位置資訊與 overlay，現行主流程仍是列表式校對。
- Backend 不提供任務歷史。task JSON 匯入/匯出只是本機檔案交接，不包含原圖。

## 隱私說明

上傳圖片只會為當次 OCR request 處理，backend 不會保存上傳圖片；這項決策記錄在 [ADR 0008](./docs/adr/0008-do-not-persist-uploaded-images.md)。第一版不提供任務歷史，因此 backend 避免持久化圖片，而不是建立一套需要另行產品設計的儲存行為。

這能降低隱私風險，但不是絕對安全保證。處理期間，圖片仍會經過你的瀏覽器、本機 backend，以及設定的 Ollama endpoint。請把這些本機服務、log、瀏覽器狀態，以及模型端可能的行為，都視為你的信任邊界。

## 快速開始

### 1. 啟動 Ollama

請先從 [Ollama 官方網站](https://ollama.com/)安裝 Ollama，然後啟動本機 server：

```bash
ollama serve
```

另開一個 terminal，拉取具備 OCR 能力的模型與翻譯模型。以下範例使用開發測試中的模型名稱；若你的機器與 prompts 已設定好，也可以改用其他模型。

```bash
ollama pull gemma3:latest
ollama pull qwen3:latest
```

### 2. 啟動 Backend

從 repository root 執行：

```bash
uv run uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

Backend 會在 `http://127.0.0.1:8000` 提供 API。

### 3. 啟動 Frontend

從 repository root 執行：

```bash
cd frontend
npm install
npm run dev
```

開啟 Vite 印出的本機網址。Frontend 會把 `/api` requests proxy 到 `http://127.0.0.1:8000`。

### 4. 執行翻譯

1. 確認 Ollama URL，通常是 `http://127.0.0.1:11434`。
2. 需要時重新整理模型清單。
3. 選擇你已拉取的 OCR 模型與翻譯模型。
4. 上傳漫畫圖片。
5. 圖片與兩個模型都就緒後，app 會自動連續執行 OCR 與翻譯。
6. 完成後校對 OCR 文字區塊，再用 **重新翻譯** 以修正後文字重跑翻譯，不需要重跑 OCR。
7. 複製單段翻譯、複製全部翻譯、匯出純文字，或匯出/匯入 task JSON 以便之後繼續校對。

## 專案結構

- `backend/`：FastAPI application、API routes、Ollama client 與 backend tests。
- `frontend/`：React/Vite application、UI tests 與 frontend build configuration。
- `docs/adr/`：Architecture decision records，包含上傳圖片持久化決策。
- `pyproject.toml`：Python package metadata、backend dependencies、pytest config 與 ruff config。

## 驗證

開發檢查可以執行：

```bash
uv run pytest
cd frontend
npm test
```
