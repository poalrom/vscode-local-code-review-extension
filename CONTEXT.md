# Local Code Review

A VSCode extension for local, GitHub-style code review. Its output is a
workspace file that AI coding agents read and resolve. The reviewer leaves
comments in the editor; agents answer and fix them by appending to a shared,
append-only log.

## Language

**Review**:
A named collection of threads worked as one unit. One review is _active_ at a
time; its state lives in a single append-only log.
_Avoid_: Session, batch.

**Thread**:
A single point of discussion anchored to a range of code. Has a status
(_open_ or _resolved_) and one or more comments, the first being its opening
comment.
_Avoid_: Discussion, conversation.

**Comment**:
One authored message inside a thread, identified by a stable id of the form
`<thread>.c<N>`. Carries an author and a body.
_Avoid_: Note, message, remark.

**Reviewer**:
The human author, writing comments in the editor. Owns their own comments —
only the reviewer may edit them, and only through the comment widget.
_Avoid_: User, human, author (unqualified).

**Agent**:
An AI author that reads the review and appends replies/resolutions via the log.
Agents never edit existing comments.
_Avoid_: Bot, assistant, AI (unqualified).

**Edit**:
Changing an existing comment's _body_ only. Never moves the thread's anchor and
never deletes. An edit is recorded as an event, not a mutation, and marks the
comment as _edited_.
_Avoid_: Update, revise, amend.

**Snapshot**:
The exact commented text captured when a thread is created; drives re-anchoring
so a thread follows its code as the file changes.
_Avoid_: Excerpt, context.

**Outdated**:
A thread whose snapshot can no longer be found in the current file — its anchor
is stale and shown with a warning.
_Avoid_: Stale, orphaned, broken.
