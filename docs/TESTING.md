# Manual Testing

The core (`src/core/`) is covered by `npm test` (vitest). The VSCode adapter —
gutter UI, sidebar, file watcher, anchoring on save — runs only inside a real
Extension Host, so it is verified manually with the scenario below.

## Setup

```bash
npm install
npm run build
```

In VSCode, press **F5** ("Run Extension"). A second window — the **Extension
Development Host** — opens. In it, open any folder containing a few source files
(the *test workspace*). All steps below happen in that window.

Keep `.review/` visible in the Explorer to watch the files change.

## Scenario: full human → agent loop

Run the steps in order. Check the **Expect** after each.

### 1. Create a review
- Sidebar → **Code Review** view → New Review (`+`), name it `pass-1`.
- **Expect:** `pass-1` appears in the tree, marked `●` (active). Files created:
  `.review/pass-1.log.jsonl` (empty), `.review/pass-1.view.json`
  (`threads: []`), `.review/state.json` (`{ "active": "pass-1" }`).

### 2. Add a comment
- Open a file, select 2–3 lines, right-click → **Code Review: Add Comment**
  (or palette). Type `tighten this`.
- **Expect:** a comment thread appears in the gutter at the selection, expanded,
  labelled `Open`. The tree shows the thread under `pass-1`. `pass-1.view.json`
  now has one thread with your `snapshot` (the selected text), 1-based `range`,
  `status: "open"`, and one `reviewer` comment.

### 3. Reply
- In the gutter thread, type a reply `why?` and submit.
- **Expect:** a second comment appears in the thread. `pass-1.log.jsonl` gains a
  `{"op":"reply",...}` line; the view shows two comments.

### 4. Resolve
- Use the thread's title action **Resolve**.
- **Expect:** thread label flips to `Resolved` and collapses; tree marker shows
  `✓`. The log gains a `{"op":"resolve",...}` line; view `status: "resolved"`.

### 5. Re-anchor on edit
- Reopen the thread (title action **Reopen**). Add several blank lines **above**
  the commented code, then **save**.
- **Expect:** after save, the thread moves with the code to its new line (not
  stuck at the old line number). The view's `range` updates on the next write.

### 6. Outdated detection
- Delete the commented lines entirely, then **save**.
- **Expect:** the thread stays visible, its label includes `[outdated]`. It is
  not dropped.

### 7. Agent write (watcher)
- Simulate an agent appending to the log from an external terminal:
  ```bash
  f=$(jq -r .active .review/state.json)
  ts=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  tid=$(jq -r '.threads[0].id' ".review/$f.view.json")
  printf '%s\n' "$(jq -nc --arg t "$tid" --arg ts "$ts" \
    '{op:"reply", thread:$t, author:"agent", body:"done", ts:$ts}')" >> ".review/$f.log.jsonl"
  ```
- **Expect:** within ~a moment the gutter thread + tree show the new `agent`
  reply with no editor action. `pass-1.view.json` is rewritten to include it
  (confirm it is **not** stale — the agent could re-read it correctly).

### 8. Multiple reviews + switch
- Create a second review `pass-2`. Add a comment.
- Run **Code Review: Switch Active Review** → pick `pass-1`.
- **Expect:** the active marker `●` moves to `pass-1`; `state.json` updates. New
  comments now append to `pass-1`.

### 9. Delete a review
- Run **Code Review: Delete Review** → pick `pass-2`, confirm.
- **Expect:** `pass-2` disappears from the tree; its `.log.jsonl`/`.view.json`
  are removed. Active stays valid (falls back if the deleted one was active).

## Pass criteria

All nine steps behave as described, with no errors in the Extension Host's
Developer Tools console (Help → Toggle Developer Tools). Re-run after any change
to `src/vscode/`.
