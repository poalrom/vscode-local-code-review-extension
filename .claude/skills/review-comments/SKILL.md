---
name: review-comments
description: Read and resolve human code-review comments left by the Local Code Review VSCode extension. Use when the user asks to address review comments, fix review feedback, or work the review file in .review/. Triggers on "address the review", "fix review comments", "resolve review threads".
---

# Working Code Review Comments

The Local Code Review extension stores a reviewer's comments in `.review/`. Read
the human-friendly **view**; make changes by **appending events** to the log.
Never edit the `.view.json` (the extension owns it) and never rewrite the log —
only append. This keeps you race-free with the live extension.

## Prerequisite

`jq` must be installed (`jq --version`). If missing, tell the user.

## Files

- `.review/state.json` — `{ "active": "<name>" }`, names the active review.
- `.review/<name>.view.json` — current state (read this).
- `.review/<name>.log.jsonl` — append events here to act.

## Read open threads

```bash
f=$(jq -r .active .review/state.json)
jq '.threads[] | select(.status=="open")
    | {id, file, range, snapshot, last: (.comments[-1].body)}' ".review/$f.view.json"
```

Each thread gives you `file`, a 1-based `range`, the commented `snapshot`, and
the latest comment. Open the file, make the requested change.

## Check a comment is still anchored

If the code moved, confirm the snapshot still exists before trusting the range:

```bash
grep -nF "$(jq -r '.threads[] | select(.id=="t_a1") | .snapshot' ".review/$f.view.json")" path/to/file
```

No match → the code changed; locate the relevant code manually before editing.

## Reply to a thread

```bash
f=$(jq -r .active .review/state.json)
log=".review/$f.log.jsonl"
ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
printf '%s\n' "$(jq -nc --arg t t_a1 --arg b "Fixed, switched to <=." --arg ts "$ts" \
  '{op:"reply", thread:$t, author:"agent", body:$b, ts:$ts}')" >> "$log"
```

## Resolve a thread (after addressing it)

```bash
printf '%s\n' "$(jq -nc --arg t t_a1 --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{op:"resolve", thread:$t, ts:$ts}')" >> "$log"
```

## Reopen a thread

```bash
printf '%s\n' "$(jq -nc --arg t t_a1 --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{op:"reopen", thread:$t, ts:$ts}')" >> "$log"
```

## Rules

- Read `view.json`, write only by appending to `log.jsonl`.
- `author` is always `"agent"` for your comments.
- You reply/resolve/reopen existing threads — you do not create threads (that is
  the reviewer's job), so you never mint thread ids; read `id` from the view.
- One event per appended line; `jq -nc` builds valid escaped JSON.

## Typical loop

1. Read open threads from the view.
2. For each: open the file, make the fix.
3. Append a `reply` describing what you did.
4. Append a `resolve`.
5. Tell the user which threads you addressed.
