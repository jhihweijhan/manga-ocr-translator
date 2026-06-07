## 摘要

- TBD

## 相關 issues

- Closes #

## 行為變更

- TBD

## ADR / Product 影響

- `docs/PRODUCT.md`：
- `docs/adr/`：
- 若無影響，請寫明「無」。

## 截圖 / Smoke

- 截圖：
- 真實操作或 smoke test：

## 測試 checklist

- [ ] `cd frontend && npx tsc -b && npm test && npm run build`
- [ ] `uv run pytest`
- [ ] `uv run ruff check backend`
- [ ] `git diff --check`
- [ ] 文件/template-only PR 已跑指定路徑的 `git diff --check -- <paths>`

> repo root 的 `uv run ruff check` 可能掃到本機未追蹤技能檔，不應作為提交前唯一依據。後端 lint 以 `uv run ruff check backend` 為必要項。

## 風險 / Rollback

- 主要風險：
- Rollback：
