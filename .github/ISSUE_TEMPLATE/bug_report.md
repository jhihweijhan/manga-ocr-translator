---
name: 錯誤回報
about: 回報可重現的錯誤、退化或不符合規格的行為
title: "[錯誤] "
labels: needs-triage
assignees: ""
---

## 摘要

請用一兩句話描述問題與影響。

## 環境

- OS：
- Browser：
- Node / npm：
- Python：
- Ollama 版本：
- OCR 模型：
- 翻譯模型：
- commit 或 branch：

## 重現步驟

1.
2.
3.

## 期望行為

請描述依 `docs/PRODUCT.md` 或既有 UI 應該發生什麼。

## 實際行為

請描述實際看到的畫面、錯誤訊息或 API 回應。

## 截圖或錄影

若是 UI 問題，請附截圖或短錄影。請避免上傳含敏感資訊的原圖。

## Logs

請貼必要片段即可，不要貼完整大量 logs。

```text

```

## Local-first / ADR 檢查

- 是否可能影響本機處理、Ollama proxy、上傳圖片不持久化、strict JSON、`block_id` 對應、提示詞每請求重讀或 `position: null`？
- 相關 ADR：
- 是否需要更新 `docs/PRODUCT.md` 或 `docs/adr/`：

## 驗證方式

請列出你已執行的檢查，或說明尚未執行的原因。

```bash
cd frontend && npx tsc -b && npm test && npm run build
uv run pytest
uv run ruff check backend
```
