# 漫畫翻譯神器

本專案是 local-first 漫畫 OCR translator。當前已包含可啟動的 FastAPI backend、React/Vite frontend、Ollama 模型清單 proxy、提示詞模板檢視，以及單張圖片 OCR 文字區塊 slice。

## Backend

```bash
uv run uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

## Frontend

```bash
cd frontend
npm install
npm run dev
```

開啟 Vite 顯示的本機網址。Frontend 會透過 Vite proxy 將 `/api` 請求轉給 `http://127.0.0.1:8000`。

## Tests

```bash
uv run pytest
cd frontend
npm test
```
