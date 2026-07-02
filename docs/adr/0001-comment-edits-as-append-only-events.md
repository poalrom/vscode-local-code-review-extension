# Comment edits are append-only events targeting a comment id

## Status

accepted

## Context

The review log is append-only and shared between the extension and AI agents;
the fold rebuilds the view from events. Editing a comment's body could have been
an in-place mutation, but that would break the append-only invariant and race
with out-of-band agent writes. We add an `edit_comment` event instead.

## Decision

- Editing changes a comment's **body only** — never the anchor, never deletion.
- `edit_comment` targets the **full comment id** (`t_ab12cd3.c2`); the fold
  derives the thread by splitting on `.c`. This is the only event without an
  explicit `thread` field.
- The fold sets an `editedAt` timestamp on the comment; the UI shows `(edited)`.
- Editing is **reviewer-only** (`author === 'reviewer'`) and reachable **only
  through the comment widget** (per-comment `contextValue: 'canEdit'`), so it is
  only reachable on open threads. The sidebar navigates but does not edit.
- `edit_comment` is **not exposed to agents** and carries no `author` field —
  editing does not change who wrote the comment. The fold still tolerates such
  an event if one ever appears.

## Considered Options

- **Carry `thread` explicitly on `edit_comment`** (like every other event) —
  rejected in favour of a self-contained comment id, at the cost of coupling the
  fold to the `<thread>.c<N>` id format.
- **In-place mutation of the view** — rejected; breaks append-only and races
  with agents.
- **Empty body as delete** — rejected; deletion is out of scope, so an empty
  save is a no-op.

## Consequences

- The fold is coupled to the comment-id format: changing `<thread>.c<N>` means
  changing how `edit_comment` resolves its thread.
- The log retains every prior body (old event + edit event); the view shows only
  the latest, so history is recoverable without bloating the view.
- The render signature must include `editedAt` so an edit triggers a re-render.
