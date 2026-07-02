# CodeReview.json

A VSCode extension for GitHub-style code review, **on your machine**, with the
output stored as structured JSON that AI coding agents can read and act on.

You leave threaded comments on any line of any file. The extension writes them
to `.review/` in your workspace. An agent reads the open comments, fixes the
code, replies, and resolves the threads — a tight **human-reviews → agent-acts**
loop.

## Why

Existing local-review extensions export Markdown for humans. This one treats the
agent as a first-class consumer: comments live in an append-only JSON event log
that is safe to write concurrently (reviewer in the editor + agent in the
terminal, no lost updates), plus a derived `view.json` that is trivial to query
with `jq`.

## Features

- **Comment anywhere** — select lines in any file, add a GitHub-style comment
  thread (native VSCode Comments API: gutter icon, inline thread, reply box,
  resolve/reopen).
- **Threaded replies + status** — reviewer and agent converse on a thread;
  resolve when addressed.
- **Durable anchoring** — comments store a snapshot of the reviewed code. When
  the file changes, threads re-locate to the moved code, or are flagged
  `[outdated]` if the code is gone — never silently dropped.
- **Multiple reviews, one active** — run several review passes; new comments
  land in the active one. Manage them from the sidebar or the command palette.
- **Agent-ready** — comments are plain JSON; a bundled Claude Code skill teaches
  agents to read and resolve them with `jq`.

## Install / develop

```bash
npm install
npm run build      # esbuild -> dist/extension.js
npm test           # vitest (core unit tests)
npm run compile    # tsc --noEmit typecheck
```

Press **F5** in VSCode to launch an Extension Development Host with the
extension loaded (builds first via the default build task).

## Using it

1. **Start a review** — sidebar "Code Review" → New Review (or palette:
   `Code Review: New Review`). It becomes the active review.
2. **Comment** — select code → right-click → `Code Review: Add Comment` (or the
   palette). A thread appears in the gutter and the sidebar.
3. **Converse** — reply in the thread; resolve it when done.
4. **Switch reviews** — `Code Review: Switch Active Review`.

## Storage layout

Everything lives under `.review/` in the workspace root:

| File | Writer | Purpose |
|------|--------|---------|
| `<name>.log.jsonl` | extension **and** agent (append-only) | source of truth: one event per line |
| `<name>.view.json` | extension only | materialized current state (read this) |
| `state.json` | extension | `{ "active": "<name>" }` — the active review |

The **log** is the source of truth. Both the extension and agents only ever
**append** events to it (atomic, race-free). The extension folds the log into
the **view** for easy reading. See `docs/superpowers/specs/` for the full design.

### Event shapes

```jsonl
{"op":"add_thread","id":"t_a1","file":"src/x.ts","range":{"startLine":1,"endLine":1},"snapshot":"const a=1","author":"reviewer","body":"use let","ts":"2026-06-15T10:00:00Z"}
{"op":"reply","thread":"t_a1","author":"agent","body":"fixed","ts":"2026-06-15T10:05:00Z"}
{"op":"resolve","thread":"t_a1","ts":"2026-06-15T10:06:00Z"}
```

`range` is 1-based; `ts` is ISO-8601 UTC; `author` is `reviewer` or `agent`.

## The agent loop

Agents read `<name>.view.json` and act by appending events to the log — never
rewriting either file. A bundled agent skill at
`skills/review-comments/SKILL.md` documents the `jq` recipes:

```bash
f=$(jq -r .active .review/state.json)
# list open threads
jq '.threads[] | select(.status=="open")' ".review/$f.view.json"
# reply
printf '%s\n' "$(jq -nc --arg t t_a1 --arg b "Fixed" --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{op:"reply", thread:$t, author:"agent", body:$b, ts:$ts}')" >> ".review/$f.log.jsonl"
# resolve
printf '%s\n' "$(jq -nc --arg t t_a1 --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{op:"resolve", thread:$t, ts:$ts}')" >> ".review/$f.log.jsonl"
```

`jq` is required on the agent side.

### Installing the skill in your project

The skill follows the [Agent Skills](https://github.com/vercel-labs/skills)
layout, so the `skills` CLI can install it into whatever agent you use
(Claude Code, Cursor, Codex, opencode, …):

```bash
npx skills add poalrom/vscode-local-code-review-extension
```

That copies `review-comments` into your project's agent skill directory; the
agent then knows how to read `.review/` and resolve threads when you ask it to
"address the review comments". Inside this repo Claude Code picks the skill up
automatically — `.claude/skills/review-comments` is a symlink to
`skills/review-comments`.

## Architecture

- `src/core/` — VSCode-agnostic, unit-tested: `types`, `events` (log→view fold),
  `anchor` (snapshot re-location), `storage` (file I/O), `ids`.
- `src/vscode/` — adapter: `reviewService`, `commentsController` (Comments API),
  `treeProvider` (sidebar), `commands`.
- `src/extension.ts` — activation, wiring, file watcher.

Keeping the core free of `vscode` imports keeps it testable and leaves room for
a future adapter in another editor (the design notes a possible LSP-based path).

## Scope

v1 is ad-hoc commenting. Git-diff/PR review mode, an MCP server, log compaction,
and other editors are intentionally out of scope — see
`docs/superpowers/specs/` for the design and rejected alternatives.
