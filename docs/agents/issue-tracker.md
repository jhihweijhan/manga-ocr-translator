# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues in `jhihweijhan/manga-ocr-translator`. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body-file <file> --label "ready-for-agent"`.
- **Read an issue**: `gh issue view <number> --comments`, fetching labels when needed.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments`.
- **Comment on an issue**: `gh issue comment <number> --body-file <file>`.
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`.
- **Close**: `gh issue close <number> --comment "..."`.

Infer the repo from `git remote -v` when available. If the remote is not present, pass `--repo jhihweijhan/manga-ocr-translator`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
