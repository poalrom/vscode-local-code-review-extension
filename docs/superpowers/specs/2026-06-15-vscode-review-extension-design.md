# VSCode Code Review Extension — Design

**Date:** 2026-06-15
**Status:** Approved (design phase)

## Purpose

A VSCode extension for reviewing code locally and leaving GitHub-style comments
on any line of any file. Review output is stored in the workspace as structured
data so AI coding agents can read open comments, act on them, reply, and resolve
them — a tight human-reviews → agent-acts loop.

## Scope (v1)

- **In:** Ad-hoc commenting (any file, any line range), threaded comments with
  replies, resolve/reopen status, multiple review files with one active,
  durable line anchoring across edits, an append-only event log for
  concurrency-safe writes, a jq-based Claude Code skill for agents.
- **Out (deferred):** Git diff / PR-style review mode. Zed editor support
  (Zed's extension API cannot render comment-thread UI today; revisit via an
  LSP adapter later). MCP server (file + jq skill suffice for v1). Log
  compaction.

## Prior Art

Existing extensions (Review Comment Renderer, prateek/vscode-local-code-review,
d-koppenhagen/vscode-code-review, Agent Review) validate the pattern
(VSCode Comments API + markdown/JSON in a workspace dir). None nail the
human→structured-file→agent loop with JSON storage. We build fresh; the
proven pattern is Comments API + a `.review/` dir as the persistence layer.

## Architecture

Standard VSCode extension, TypeScript, bundled with esbuild. The codebase
splits into a **VSCode-agnostic core** and a **thin VSCode adapter layer**, so
the core stays unit-testable and reusable (e.g. a future Zed/LSP adapter).

### Modules

- **`core/events`** — event types + a pure fold function: `events[] → view`.
  No I/O, no VSCode. The heart of the data model.
- **`core/anchor`** — given a thread's stored `range` + `snapshot` and a
  document's text, compute current location (exact → search → outdated).
  No VSCode deps (operates on plain strings/lines).
- **`core/storage`** — read/write `.review/` files: append events to the log
  (atomic), read `state.json`, write the materialized read-only view. Minimal
  filesystem dependency, injectable for tests.
- **`comments`** — bridges the materialized view ↔ VSCode Comments API
  (render threads in the gutter, handle reply/resolve UI actions by appending
  events).
- **`tree`** — sidebar TreeView: review files (active marked) → threads →
  comments; click to jump; toolbar actions.
- **`commands`** — palette + menu commands, all routed through the event-append
  path.
- **`extension.ts`** — activation, file watcher, wiring.

### Data flow

1. Reviewer action (add/reply/resolve) → `commands`/`comments` → append one
   event to the log → extension folds → updates UI + rewrites the view file.
2. Agent action → appends an event to the log directly (via the jq skill) →
   extension's file watcher sees the new line → folds → updates UI + view.

Both writers **only ever append** to the log. The extension is the **sole
writer** of the materialized view file. This eliminates lost-update races by
construction.

## Persistence

Directory: `.review/` in the workspace root.

| File | Writer | Purpose |
|------|--------|---------|
| `<name>.log.jsonl` | extension **and** agent (append-only) | source of truth: one event per line |
| `<name>.view.json` | extension only | materialized current state (nested, readable) |
| `state.json` | extension | `{ "active": "<name>" }` pointer to active review |

### Event log (`<name>.log.jsonl`) — source of truth

One JSON object per line. Appends are atomic (POSIX, small lines) and
order-tolerant (the fold reconstructs state). Example:

```jsonl
{"op":"add_thread","id":"t_a1","file":"src/auth/login.ts","range":{"startLine":42,"endLine":45},"snapshot":"  if (user.token < now) {\n    return null;\n  }","author":"reviewer","body":"Use <= here, off-by-one on expiry.","ts":"2026-06-15T10:01:00Z"}
{"op":"reply","thread":"t_a1","author":"agent","body":"Fixed, switched to <=.","ts":"2026-06-15T10:05:00Z"}
{"op":"resolve","thread":"t_a1","ts":"2026-06-15T10:06:00Z"}
```

**Event ops:**

- `add_thread` — `{op, id, file, range, snapshot, author, body, ts}` (creates a
  thread plus its first comment).
- `reply` — `{op, thread, author, body, ts}` (appends a comment).
- `resolve` — `{op, thread, ts}` (sets status `resolved`).
- `reopen` — `{op, thread, ts}` (sets status `open`).

`author` is `"reviewer" | "agent"` by convention (free string).
`range` is **1-based** (matches editor display, human/agent readable).
`ts` is ISO-8601 UTC.

### Materialized view (`<name>.view.json`) — read-only convenience

Extension folds the log into this nested shape for easy human/agent reading.
Agents READ this; they never write it.

```json
{
  "version": 1,
  "name": "auth-refactor",
  "createdAt": "2026-06-15T10:00:00Z",
  "threads": [
    {
      "id": "t_a1",
      "file": "src/auth/login.ts",
      "range": { "startLine": 42, "endLine": 45 },
      "snapshot": "  if (user.token < now) {\n    return null;\n  }",
      "status": "open",
      "createdAt": "2026-06-15T10:01:00Z",
      "comments": [
        { "id": "c_1", "author": "reviewer", "body": "Use <= here, off-by-one on expiry.", "createdAt": "2026-06-15T10:01:00Z" },
        { "id": "c_2", "author": "agent", "body": "Fixed, switched to <=.", "createdAt": "2026-06-15T10:05:00Z" }
      ]
    }
  ]
}
```

### Active review pointer (`state.json`)

```json
{ "active": "auth-refactor" }
```

Separate pointer file: switching active = one atomic write, review files stay
clean, no risk of two-actives. Active must live on disk (not VSCode memory) so
the agent can discover the target review unprompted.

## Anchoring

On file open and on document save (debounced), each thread's current location
is computed from stored `range` + `snapshot`:

1. **Exact** — text at `startLine..endLine` equals `snapshot` → place there.
2. **Search** — snapshot not at stored range → search the whole document.
   Found once → relocate (persist corrected range on next event/save). Found
   multiple → pick nearest to stored range.
3. **Outdated** — snapshot not found → mark thread `outdated` (a derived
   runtime state, NOT stored status). Still shown in tree + pinned at stored
   line, flagged so reviewer/agent knows code moved. Never silently dropped.

Stored `status` remains `open`/`resolved`; `outdated` is computed.

## Agent interface — jq skill

Ship a Claude Code skill (e.g. `.claude/skills/review-comments/`) documenting
the contract and safe recipes. Agents **read the view, append to the log.**

Read:
```bash
f=$(jq -r .active .review/state.json)
jq '.threads[] | select(.status=="open")
    | {id, file, range, last: (.comments[-1].body)}' ".review/$f.view.json"
```

Write (append one event; `jq -nc` handles escaping, `>>` is atomic):
```bash
f=$(jq -r .active .review/state.json)
log=".review/$f.log.jsonl"
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)

printf '%s\n' "$(jq -nc --arg t t_a1 --arg b "Fixed, switched to <=" --arg ts "$ts" \
  '{op:"reply", thread:$t, author:"agent", body:$b, ts:$ts}')" >> "$log"

printf '%s\n' "$(jq -nc --arg t t_a1 --arg ts "$ts" \
  '{op:"resolve", thread:$t, ts:$ts}')" >> "$log"
```

Agents typically only `reply`/`resolve`/`reopen` existing threads → they read
`thread` ids from the view and rarely mint IDs. Skill also documents folding the
log directly (`jq -s`) as a fallback when the view looks stale.

## Concurrency

Solved structurally by the append-only log:
- Both reviewer (extension) and agent **only append** to `<name>.log.jsonl`.
  Small-line appends are atomic on POSIX; events are order-tolerant.
- Extension is the **sole writer** of `<name>.view.json`.
- No locks, no read-modify-write of shared mutable state → no lost updates.
- Log compaction deferred (reviews are short-lived; log grows slowly).

## UI surface

- **Native Comments API:** gutter icon, inline expandable thread, reply box,
  resolve/reopen button; outdated threads badged.
- **Sidebar TreeView ("Code Review"):** review files (active marked ●) →
  threads → comments; click a thread to jump to its anchored location;
  toolbar: New Review, Refresh.
- **Commands (palette + editor context menu):** New Review, Switch Active,
  Delete Review, Add Comment (on selection / right-click), Reply,
  Resolve/Reopen.
- Every write command routes through the same event-append path the agent uses.

## Testing (TDD)

- **Core (pure TS, no VSCode) — the bulk:**
  - `anchor`: exact / relocate-single / relocate-multiple / outdated.
  - `events` fold: add / reply / resolve / reopen / out-of-order sequences →
    expected view.
  - `storage`: atomic append helper, view materialization.
- **VSCode adapter — light integration tests** via the extension test harness:
  command wiring, tree rendering, Comments API bridge.
- The decoupled core is also the reusable unit for a future Zed/LSP adapter.

## Tech stack

- TypeScript, VSCode Extension API, esbuild for bundling.
- Test runner for pure-core unit tests (vitest or mocha); `@vscode/test-electron`
  for integration tests.
- `jq` required on the agent side (documented as a skill prerequisite).
