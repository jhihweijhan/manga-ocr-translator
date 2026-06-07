# Manga OCR Translator

![Python 3.12](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-frontend-61DAFB?logo=react&logoColor=111111)
![Ollama](https://img.shields.io/badge/Ollama-local_models-000000?logo=ollama&logoColor=white)
![Status](https://img.shields.io/badge/status-alpha-orange)

<!-- README-I18N:START -->

**English** | [繁體中文](./README.zh-TW.md)

<!-- README-I18N:END -->

Manga OCR Translator is a local-first tool for turning one manga image into editable OCR text blocks and draft translations. It pairs a FastAPI backend with a React/Vite frontend, and uses models exposed by your local Ollama server.

## Value Proposition

Use it when you want a fast proofreading loop for manga panels without building a hosted pipeline. Upload one image, run OCR, edit the detected text, translate the blocks, then copy or export the text for the next step in your workflow.

The app is meant for small, inspectable runs: you choose the Ollama endpoint, pick OCR and translation models, review the raw text, and keep control of the local services involved.

## Screenshots And Demo

Screenshots and demo media are intentionally placeholders until the UI stabilizes:

| Asset | Placeholder |
| --- | --- |
| Main screen | Add a screenshot at `docs/assets/readme/main-screen.png`. |
| OCR and proofreading flow | Add a demo GIF at `docs/assets/readme/ocr-proofreading-demo.gif`. |

## Features

- Single-image manga OCR with editable text blocks.
- Separate OCR and translation model selection from the local Ollama model list.
- Translation output that follows the OCR block order.
- Re-translate after proofreading OCR text without rerunning OCR.
- Copy and plain-text TXT export flows for translated blocks.
- Export and import task JSON to restore text blocks, translations, model choices, language settings, and prompt settings.
- Prompt template visibility for checking how OCR and translation requests are shaped.
- First-run guidance when Ollama is not reachable.
- Local development stack with FastAPI, React, Vite, Vitest, pytest, and uv.

## Current Limits

- The implemented workflow handles one image at a time. Multi-page reading tasks, batch chapters, CBZ, and ZIP remain proposed in [ADR 0012](./docs/adr/0012-multi-page-reading-task.md) and are not supported yet.
- Streaming progress is proposed in [ADR 0011](./docs/adr/0011-stream-progress-with-complete-results.md), but the current app waits for complete OCR and translation results.
- On-image overlay and embedded translated text are not implemented. [ADR 0010](./docs/adr/0010-text-region-detection.md) only proposes future position-aware overlay support, and the active workflow remains list-based proofreading.
- The backend does not provide task history. Task JSON import/export is a local file handoff and does not include the original image.

## Privacy Notes

Uploaded images are processed for the current OCR request and are not saved by the backend, as documented in [ADR 0008](./docs/adr/0008-do-not-persist-uploaded-images.md). The first version does not provide task history, so the backend avoids image persistence instead of creating storage behavior that would need a separate product design.

This reduces privacy risk, but it is not an absolute security guarantee. Images still pass through your browser, the local backend, and the configured Ollama endpoint during processing. Treat those local services, logs, browser state, and any model-side behavior as part of your trust boundary.

## Quick Start

### 1. Start Ollama

Install Ollama from the [official Ollama site](https://ollama.com/), then start the local server:

```bash
ollama serve
```

In another terminal, pull an OCR-capable model and a translation model. These examples match the names used in the development tests; you can choose different models if your machine and prompts are configured for them.

```bash
ollama pull gemma3:latest
ollama pull qwen3:latest
```

### 2. Start The Backend

From the repository root:

```bash
uv run uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

The backend serves the API under `http://127.0.0.1:8000`.

### 3. Start The Frontend

From the repository root:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite. The frontend proxies `/api` requests to `http://127.0.0.1:8000`.

### 4. Run A Translation

1. Confirm the Ollama URL, normally `http://127.0.0.1:11434`.
2. Refresh the model list if needed.
3. Select the OCR model and translation model you pulled.
4. Upload a manga image.
5. The app automatically runs OCR and translation once the image and both models are ready.
6. Proofread OCR text blocks after completion, then use **重新翻譯** to translate the edited text without rerunning OCR.
7. Copy a single translation, copy all translations, export plain text, or export/import task JSON for later proofreading.

## Project Layout

- `backend/`: FastAPI application, API routes, Ollama client, and backend tests.
- `frontend/`: React/Vite application, UI tests, and frontend build configuration.
- `docs/adr/`: Architecture decision records, including the uploaded-image persistence decision.
- `pyproject.toml`: Python package metadata, backend dependencies, pytest config, and ruff config.

## Verification

For development checks:

```bash
uv run pytest
cd frontend
npm test
```
