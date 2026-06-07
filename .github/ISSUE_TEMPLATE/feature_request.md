---
name: 功能提案
about: 提出新功能、行為調整或文件改善
title: "[功能] "
labels: needs-triage
assignees: ""
---

## 摘要

請描述想解決的問題，不要只描述想新增的 UI 或 API。

## 使用情境

- 誰會使用：
- 在哪個翻譯任務流程中發生：
- 現在的替代方式：

## 環境

若功能請求來自實際使用限制，請填寫可協助判斷的環境。

- OS：
- Browser：
- Node / npm：
- Python：
- Ollama 版本：
- OCR 模型：
- 翻譯模型：
- commit 或 branch：

## 重現步驟或目前流程

若這是改善既有流程，請列出現在如何操作。

1.
2.
3.

## 期望行為

請描述完成後使用者或貢獻者應該看到什麼。

## 實際行為

請描述目前實際限制、錯誤或缺口。若這是全新能力，請寫「目前無對應行為」。

## 非目標

請列出本 issue 不處理的範圍，避免 PR 擴張。

## Local-first / ADR 檢查

- 是否符合 local-first：瀏覽器呼叫本機後端，本機後端呼叫本機 Ollama。
- 是否會保存上傳圖片、任務歷史或匯出圖片檔本身。
- 是否會改變 strict JSON、`block_id` 對應、提示詞每請求重讀、取消處理或 `position: null` 行為。
- 是否需要新增或更新 `docs/PRODUCT.md`：
- 是否需要新增或更新 `docs/adr/`：

## UI / 截圖 / Smoke

若涉及 WebUI，請描述需要檢查的畫面狀態與截圖範圍。

## Logs

若有相關錯誤或 API 回應，請貼必要片段即可。

```text

```

## 驗證方式

請列出預期的驗收方式。若是程式變更，至少考慮：

```bash
cd frontend && npx tsc -b && npm test && npm run build
uv run pytest
uv run ruff check backend
```

## 其他資料

請附相關 issue、ADR、設計稿、logs 或使用者回報。
