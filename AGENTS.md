# AGENTS.md instructions for /home/karl/Workspace/Toys/漫畫翻譯神器-先測版

You always speak(response) with tranditional Chinese.

多利用 context7 or deepwiki 查詢 package、libs 如何使用。

利用 bash date 的時間。

docker compose 的指令是 docker compose。

如果專案有 pyproject.toml，以 uv 為python的環境。

利用 sequential-thinking 協助你思考。

執行計畫性的任務時，每個任務都要和我一起協同作業和討論。

Design-first 文件誠實性規則：design-first 的 ADR 與 PRODUCT/TECH 規格段落，在對應程式碼落地前，必須帶 `Status: Proposed（尚未實作）` 並使用提案式語氣；不得寫進 PRODUCT/TECH 主規格行為清單而沒有未實作標註。

## Agent skills

### Issue tracker

Issues and PRDs live in GitHub Issues for `jhihweijhan/manga-ocr-translator`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the default triage label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context repo: read root `CONTEXT.md` and relevant ADRs under `docs/adr/`. See `docs/agents/domain.md`.
