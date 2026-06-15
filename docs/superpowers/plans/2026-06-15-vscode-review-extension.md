# VSCode Code Review Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A VSCode extension to leave GitHub-style threaded comments on any file/line, stored as an append-only event log that AI agents read (as a derived JSON view) and write (by appending events) — a concurrency-safe human-reviews → agent-acts loop.

**Architecture:** A VSCode-agnostic core (event types + pure `fold`, anchoring, filesystem storage) under `src/core/`, plus a thin VSCode adapter (`src/vscode/`) bridging the core to the native Comments API, a sidebar TreeView, and commands. The append-only log (`<name>.log.jsonl`) is the source of truth; the extension is the sole writer of the derived read-only `<name>.view.json`. A `state.json` pointer names the active review. A jq-based Claude Code skill documents the agent contract.

**Tech Stack:** TypeScript, VSCode Extension API (`^1.90.0`), esbuild (bundling), vitest (pure-core unit tests), Node `fs` (storage), `jq` (agent side, documented prerequisite).

Spec: `docs/superpowers/specs/2026-06-15-vscode-review-extension-design.md`. Design principles: `SW_ZEN.md`.

---

## File Structure

```
package.json                         # manifest: engines, deps, scripts, contributes
tsconfig.json                        # TS config for core + vscode
esbuild.js                           # bundle src/extension.ts -> dist/extension.js
vitest.config.ts                     # core unit-test config
.vscodeignore                        # packaging excludes
.gitignore
src/
  core/                              # VSCode-agnostic, unit-tested
    types.ts                         # Range, Comment, Thread, ReviewView, ReviewEvent union
    events.ts                        # fold(name, events) -> ReviewView
    anchor.ts                        # anchor(docLines, range, snapshot) -> AnchorResult
    storage.ts                       # log/view/state file I/O, atomic append + write
    ids.ts                           # newThreadId()
  vscode/                            # thin VSCode adapter
    reviewService.ts                 # orchestrates storage + fold; apply(event), view(), active()
    commentsController.ts            # bridge ReviewView <-> Comments API per document
    treeProvider.ts                  # sidebar: reviews -> threads -> comments
    commands.ts                      # command handlers wired to ReviewService
  extension.ts                       # activate/deactivate, wiring, file watcher
test/
  core/
    events.test.ts
    anchor.test.ts
    storage.test.ts
    ids.test.ts
.claude/skills/review-comments/SKILL.md   # agent jq contract
```

**Responsibilities (one per file):** `types` = the data vocabulary; `events` = state reconstruction; `anchor` = positioning; `storage` = persistence; `ids` = identity; `reviewService` = use-case orchestration; `commentsController` = gutter UI; `treeProvider` = sidebar UI; `commands` = user intents; `extension` = composition root.

---

## Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `esbuild.js`, `vitest.config.ts`, `.vscodeignore`, `.gitignore`, `src/extension.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "code-review-local",
  "displayName": "Local Code Review",
  "description": "GitHub-style local code review comments, stored as JSON for AI agents.",
  "version": "0.0.1",
  "publisher": "local",
  "engines": { "vscode": "^1.90.0" },
  "categories": ["Other"],
  "main": "./dist/extension.js",
  "activationEvents": ["onStartupFinished"],
  "contributes": {
    "commands": [
      { "command": "review.newReview", "title": "Code Review: New Review" },
      { "command": "review.switchActive", "title": "Code Review: Switch Active Review" },
      { "command": "review.deleteReview", "title": "Code Review: Delete Review" },
      { "command": "review.addComment", "title": "Code Review: Add Comment" },
      { "command": "review.refresh", "title": "Code Review: Refresh", "icon": "$(refresh)" },
      { "command": "review.replySubmit", "title": "Reply" },
      { "command": "review.resolve", "title": "Resolve", "icon": "$(check)" },
      { "command": "review.reopen", "title": "Reopen", "icon": "$(history)" }
    ],
    "viewsContainers": {
      "activitybar": [
        { "id": "reviewContainer", "title": "Code Review", "icon": "$(comment-discussion)" }
      ]
    },
    "views": {
      "reviewContainer": [
        { "id": "reviewTree", "name": "Reviews" }
      ]
    },
    "menus": {
      "editor/context": [
        { "command": "review.addComment", "when": "editorHasSelection", "group": "navigation@9" }
      ],
      "view/title": [
        { "command": "review.newReview", "when": "view == reviewTree", "group": "navigation" },
        { "command": "review.refresh", "when": "view == reviewTree", "group": "navigation" }
      ],
      "comments/commentThread/context": [
        { "command": "review.replySubmit", "group": "inline" }
      ],
      "comments/commentThread/title": [
        { "command": "review.resolve", "group": "navigation" },
        { "command": "review.reopen", "group": "navigation" }
      ]
    }
  },
  "scripts": {
    "vscode:prepublish": "npm run build",
    "build": "node esbuild.js --production",
    "watch": "node esbuild.js --watch",
    "compile": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/vscode": "^1.90.0",
    "esbuild": "^0.21.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16",
    "target": "ES2022",
    "lib": ["ES2022"],
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "sourceMap": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 3: Create `esbuild.js`**

```js
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    sourcemap: !production,
    minify: production,
  });
  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Create `.vscodeignore`**

```
.vscode/**
src/**
test/**
docs/**
node_modules/**
esbuild.js
vitest.config.ts
tsconfig.json
**/*.map
```

- [ ] **Step 6: Create `.gitignore`**

```
node_modules/
dist/
*.vsix
.review/
```

- [ ] **Step 7: Create minimal `src/extension.ts`**

```ts
import * as vscode from 'vscode';

export function activate(_context: vscode.ExtensionContext): void {
  console.log('Local Code Review activated');
}

export function deactivate(): void {}
```

- [ ] **Step 8: Install deps and verify build + test runner**

Run: `npm install && npm run build && npm test`
Expected: build writes `dist/extension.js`; `npm test` reports "No test files found" (exit 0) — vitest runs cleanly. (If vitest exits non-zero on no-tests in your version, proceed; Task 2 adds the first test.)

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json esbuild.js vitest.config.ts .vscodeignore .gitignore src/extension.ts package-lock.json
git commit -m "chore: scaffold VSCode extension (esbuild + vitest)"
```

---

## Task 2: Core types

**Files:**
- Create: `src/core/types.ts`

These are type declarations only (no runtime behavior), exercised by the tests in Tasks 3–6. No standalone test.

- [ ] **Step 1: Create `src/core/types.ts`**

```ts
// 1-based inclusive line range, matching editor display.
export interface LineRange {
  startLine: number;
  endLine: number;
}

export type ThreadStatus = 'open' | 'resolved';

export interface Comment {
  id: string;
  author: string; // 'reviewer' | 'agent' by convention
  body: string;
  createdAt: string; // ISO-8601 UTC
}

export interface Thread {
  id: string;
  file: string; // workspace-relative path
  range: LineRange;
  snapshot: string; // exact commented text, drives anchoring
  status: ThreadStatus;
  createdAt: string;
  comments: Comment[];
}

export interface ReviewView {
  version: 1;
  name: string;
  createdAt: string;
  threads: Thread[];
}

export interface AddThreadEvent {
  op: 'add_thread';
  id: string;
  file: string;
  range: LineRange;
  snapshot: string;
  author: string;
  body: string;
  ts: string;
}

export interface ReplyEvent {
  op: 'reply';
  thread: string; // thread id
  author: string;
  body: string;
  ts: string;
}

export interface ResolveEvent {
  op: 'resolve';
  thread: string;
  ts: string;
}

export interface ReopenEvent {
  op: 'reopen';
  thread: string;
  ts: string;
}

export type ReviewEvent = AddThreadEvent | ReplyEvent | ResolveEvent | ReopenEvent;
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run compile`
Expected: no output, exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/core/types.ts
git commit -m "feat(core): add review data types"
```

---

## Task 3: Event fold

**Files:**
- Create: `src/core/events.ts`
- Test: `test/core/events.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { fold } from '../../src/core/events';
import { ReviewEvent } from '../../src/core/types';

const add: ReviewEvent = {
  op: 'add_thread', id: 't_1', file: 'a.ts',
  range: { startLine: 1, endLine: 2 }, snapshot: 'x\ny',
  author: 'reviewer', body: 'fix this', ts: '2026-06-15T10:00:00Z',
};

describe('fold', () => {
  it('creates a thread with its first comment from add_thread', () => {
    const v = fold('rev', [add]);
    expect(v.name).toBe('rev');
    expect(v.threads).toHaveLength(1);
    const t = v.threads[0];
    expect(t.id).toBe('t_1');
    expect(t.status).toBe('open');
    expect(t.comments).toEqual([
      { id: 't_1.c1', author: 'reviewer', body: 'fix this', createdAt: '2026-06-15T10:00:00Z' },
    ]);
  });

  it('appends replies with sequential comment ids', () => {
    const v = fold('rev', [
      add,
      { op: 'reply', thread: 't_1', author: 'agent', body: 'done', ts: '2026-06-15T10:05:00Z' },
    ]);
    expect(v.threads[0].comments.map((c) => c.id)).toEqual(['t_1.c1', 't_1.c2']);
    expect(v.threads[0].comments[1].author).toBe('agent');
  });

  it('applies resolve and reopen', () => {
    const resolved = fold('rev', [add, { op: 'resolve', thread: 't_1', ts: 't1' }]);
    expect(resolved.threads[0].status).toBe('resolved');
    const reopened = fold('rev', [add, { op: 'resolve', thread: 't_1', ts: 't1' }, { op: 'reopen', thread: 't_1', ts: 't2' }]);
    expect(reopened.threads[0].status).toBe('open');
  });

  it('ignores events referencing unknown threads', () => {
    const v = fold('rev', [{ op: 'reply', thread: 'ghost', author: 'agent', body: 'x', ts: 't' }]);
    expect(v.threads).toHaveLength(0);
  });

  it('ignores duplicate add_thread for same id', () => {
    const v = fold('rev', [add, { ...add, body: 'second' }]);
    expect(v.threads).toHaveLength(1);
    expect(v.threads[0].comments).toHaveLength(1);
  });

  it('preserves creation order of threads', () => {
    const second: ReviewEvent = { ...add, id: 't_2', ts: '2026-06-15T11:00:00Z' };
    const v = fold('rev', [add, second]);
    expect(v.threads.map((t) => t.id)).toEqual(['t_1', 't_2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/core/events.test.ts`
Expected: FAIL — cannot find module `../../src/core/events`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { ReviewEvent, ReviewView, Thread } from './types';

export function fold(name: string, events: ReviewEvent[]): ReviewView {
  const order: string[] = [];
  const byId = new Map<string, Thread>();

  for (const e of events) {
    switch (e.op) {
      case 'add_thread': {
        if (byId.has(e.id)) break;
        byId.set(e.id, {
          id: e.id,
          file: e.file,
          range: e.range,
          snapshot: e.snapshot,
          status: 'open',
          createdAt: e.ts,
          comments: [{ id: `${e.id}.c1`, author: e.author, body: e.body, createdAt: e.ts }],
        });
        order.push(e.id);
        break;
      }
      case 'reply': {
        const t = byId.get(e.thread);
        if (!t) break;
        t.comments.push({
          id: `${t.id}.c${t.comments.length + 1}`,
          author: e.author,
          body: e.body,
          createdAt: e.ts,
        });
        break;
      }
      case 'resolve': {
        const t = byId.get(e.thread);
        if (t) t.status = 'resolved';
        break;
      }
      case 'reopen': {
        const t = byId.get(e.thread);
        if (t) t.status = 'open';
        break;
      }
    }
  }

  return {
    version: 1,
    name,
    createdAt: events.length ? events[0].ts : '',
    threads: order.map((id) => byId.get(id)!),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/core/events.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/events.ts test/core/events.test.ts
git commit -m "feat(core): fold events into review view"
```

---

## Task 4: Anchoring

**Files:**
- Create: `src/core/anchor.ts`
- Test: `test/core/anchor.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { anchor } from '../../src/core/anchor';

const doc = (s: string) => s.split('\n');

describe('anchor', () => {
  it('returns exact when snapshot is unchanged at stored range', () => {
    const lines = doc('a\nb\nc\nd');
    const r = anchor(lines, { startLine: 2, endLine: 3 }, 'b\nc');
    expect(r).toEqual({ kind: 'exact', range: { startLine: 2, endLine: 3 } });
  });

  it('relocates when snapshot moved to a single new position', () => {
    const lines = doc('x\nx\na\nb\nc\nd');
    const r = anchor(lines, { startLine: 2, endLine: 3 }, 'b\nc');
    expect(r).toEqual({ kind: 'relocated', range: { startLine: 4, endLine: 5 } });
  });

  it('picks the match nearest the stored range when multiple exist', () => {
    const lines = doc('b\nc\nz\nz\nb\nc'); // matches at line 1 and line 5
    const r = anchor(lines, { startLine: 5, endLine: 6 }, 'b\nc');
    expect(r).toEqual({ kind: 'relocated', range: { startLine: 5, endLine: 6 } });
  });

  it('returns outdated when snapshot is gone', () => {
    const lines = doc('a\nb\nc');
    const r = anchor(lines, { startLine: 1, endLine: 1 }, 'zzz');
    expect(r).toEqual({ kind: 'outdated' });
  });

  it('handles a single-line snapshot', () => {
    const lines = doc('one\ntwo\nthree');
    const r = anchor(lines, { startLine: 2, endLine: 2 }, 'two');
    expect(r).toEqual({ kind: 'exact', range: { startLine: 2, endLine: 2 } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/core/anchor.test.ts`
Expected: FAIL — cannot find module `../../src/core/anchor`.

- [ ] **Step 3: Write minimal implementation**

```ts
import { LineRange } from './types';

export type AnchorResult =
  | { kind: 'exact'; range: LineRange }
  | { kind: 'relocated'; range: LineRange }
  | { kind: 'outdated' };

export function anchor(docLines: string[], range: LineRange, snapshot: string): AnchorResult {
  const snapLines = snapshot.split('\n');
  const height = snapLines.length;

  if (matchesAt(docLines, range.startLine - 1, snapLines)) {
    return { kind: 'exact', range };
  }

  const matches: number[] = [];
  for (let i = 0; i + height <= docLines.length; i++) {
    if (matchesAt(docLines, i, snapLines)) matches.push(i);
  }

  if (matches.length > 0) {
    const storedStart = range.startLine - 1;
    let best = matches[0];
    for (const m of matches) {
      if (Math.abs(m - storedStart) < Math.abs(best - storedStart)) best = m;
    }
    return { kind: 'relocated', range: { startLine: best + 1, endLine: best + height } };
  }

  return { kind: 'outdated' };
}

function matchesAt(docLines: string[], start: number, snapLines: string[]): boolean {
  if (start < 0 || start + snapLines.length > docLines.length) return false;
  for (let j = 0; j < snapLines.length; j++) {
    if (docLines[start + j] !== snapLines[j]) return false;
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/core/anchor.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/anchor.ts test/core/anchor.test.ts
git commit -m "feat(core): anchor threads via snapshot match"
```

---

## Task 5: Storage

**Files:**
- Create: `src/core/storage.ts`
- Test: `test/core/storage.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as storage from '../../src/core/storage';
import { ReviewEvent } from '../../src/core/types';

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'review-')); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

const ev: ReviewEvent = {
  op: 'add_thread', id: 't_1', file: 'a.ts',
  range: { startLine: 1, endLine: 1 }, snapshot: 'x',
  author: 'reviewer', body: 'hi', ts: 't',
};

describe('storage', () => {
  it('appends and reads back events in order', () => {
    storage.appendEvent(dir, 'rev', ev);
    storage.appendEvent(dir, 'rev', { op: 'resolve', thread: 't_1', ts: 't2' });
    const log = storage.readLog(dir, 'rev');
    expect(log).toHaveLength(2);
    expect(log[0]).toEqual(ev);
    expect(log[1]).toEqual({ op: 'resolve', thread: 't_1', ts: 't2' });
  });

  it('readLog returns [] for a missing log', () => {
    expect(storage.readLog(dir, 'nope')).toEqual([]);
  });

  it('readLog skips blank lines', () => {
    storage.ensureLog(dir, 'rev');
    fs.appendFileSync(storage.logPath(dir, 'rev'), '\n');
    storage.appendEvent(dir, 'rev', ev);
    expect(storage.readLog(dir, 'rev')).toHaveLength(1);
  });

  it('writes and reads the view file', () => {
    const view = { version: 1 as const, name: 'rev', createdAt: 't', threads: [] };
    storage.writeView(dir, 'rev', view);
    const raw = JSON.parse(fs.readFileSync(storage.viewPath(dir, 'rev'), 'utf8'));
    expect(raw).toEqual(view);
  });

  it('reads default state when absent and round-trips state', () => {
    expect(storage.readState(dir)).toEqual({ active: null });
    storage.writeState(dir, { active: 'rev' });
    expect(storage.readState(dir)).toEqual({ active: 'rev' });
  });

  it('lists reviews by log filename', () => {
    storage.ensureLog(dir, 'beta');
    storage.ensureLog(dir, 'alpha');
    expect(storage.listReviews(dir)).toEqual(['alpha', 'beta']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/core/storage.test.ts`
Expected: FAIL — cannot find module `../../src/core/storage`.

- [ ] **Step 3: Write minimal implementation**

```ts
import * as fs from 'fs';
import * as path from 'path';
import { ReviewEvent, ReviewView } from './types';

export interface ReviewState {
  active: string | null;
}

export function logPath(dir: string, name: string): string {
  return path.join(dir, `${name}.log.jsonl`);
}
export function viewPath(dir: string, name: string): string {
  return path.join(dir, `${name}.view.json`);
}
export function statePath(dir: string): string {
  return path.join(dir, 'state.json');
}

export function ensureLog(dir: string, name: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const p = logPath(dir, name);
  if (!fs.existsSync(p)) fs.writeFileSync(p, '');
}

export function appendEvent(dir: string, name: string, event: ReviewEvent): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(logPath(dir, name), JSON.stringify(event) + '\n');
}

export function readLog(dir: string, name: string): ReviewEvent[] {
  const p = logPath(dir, name);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ReviewEvent);
}

function writeAtomic(target: string, contents: string): void {
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, target);
}

export function writeView(dir: string, name: string, view: ReviewView): void {
  fs.mkdirSync(dir, { recursive: true });
  writeAtomic(viewPath(dir, name), JSON.stringify(view, null, 2));
}

export function readState(dir: string): ReviewState {
  const p = statePath(dir);
  if (!fs.existsSync(p)) return { active: null };
  return JSON.parse(fs.readFileSync(p, 'utf8')) as ReviewState;
}

export function writeState(dir: string, state: ReviewState): void {
  fs.mkdirSync(dir, { recursive: true });
  writeAtomic(statePath(dir), JSON.stringify(state, null, 2));
}

export function listReviews(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const suffix = '.log.jsonl';
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(suffix))
    .map((f) => f.slice(0, -suffix.length))
    .sort();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/core/storage.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/storage.ts test/core/storage.test.ts
git commit -m "feat(core): file storage for log, view, state"
```

---

## Task 6: Thread ids

**Files:**
- Create: `src/core/ids.ts`
- Test: `test/core/ids.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { newThreadId } from '../../src/core/ids';

describe('newThreadId', () => {
  it('prefixes with t_', () => {
    expect(newThreadId(() => 0).startsWith('t_')).toBe(true);
  });

  it('is deterministic given a fixed rng', () => {
    expect(newThreadId(() => 0)).toBe(newThreadId(() => 0));
  });

  it('produces different ids for different rng values', () => {
    expect(newThreadId(() => 0.1)).not.toBe(newThreadId(() => 0.9));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/core/ids.test.ts`
Expected: FAIL — cannot find module `../../src/core/ids`.

- [ ] **Step 3: Write minimal implementation**

```ts
export function newThreadId(rand: () => number = Math.random): string {
  const n = Math.floor(rand() * 2 ** 32);
  return 't_' + n.toString(36).padStart(7, '0');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/core/ids.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the full core suite and commit**

Run: `npm test`
Expected: PASS — all four core test files green.

```bash
git add src/core/ids.ts test/core/ids.test.ts
git commit -m "feat(core): generate thread ids"
```

---

## Task 7: Review service (orchestration)

**Files:**
- Create: `src/vscode/reviewService.ts`

This composes the core: it owns the `.review` directory path and turns intents into appended events + a rewritten view. Verified via compilation here and exercised end-to-end in the manual launch (Task 11).

- [ ] **Step 1: Create `src/vscode/reviewService.ts`**

```ts
import { ReviewEvent, ReviewView } from '../core/types';
import { fold } from '../core/events';
import * as storage from '../core/storage';

// ISO-8601 UTC timestamp, wrapped so callers don't touch Date directly.
export function nowIso(): string {
  return new Date().toISOString();
}

export class ReviewService {
  constructor(private readonly dir: string) {}

  active(): string | null {
    return storage.readState(this.dir).active;
  }

  list(): string[] {
    return storage.listReviews(this.dir);
  }

  setActive(name: string): void {
    storage.writeState(this.dir, { active: name });
  }

  createReview(name: string): void {
    storage.ensureLog(this.dir, name);
    storage.writeView(this.dir, name, { version: 1, name, createdAt: '', threads: [] });
    this.setActive(name);
  }

  deleteReview(name: string): void {
    storage.removeReview(this.dir, name);
    if (this.active() === name) {
      const remaining = this.list();
      storage.writeState(this.dir, { active: remaining[0] ?? null });
    }
  }

  view(name: string): ReviewView {
    return fold(name, storage.readLog(this.dir, name));
  }

  // Append an event to the active review, rebuild + persist the view, return it.
  apply(event: ReviewEvent): ReviewView {
    const name = this.active();
    if (!name) throw new Error('No active review. Create one first.');
    storage.appendEvent(this.dir, name, event);
    const v = this.view(name);
    storage.writeView(this.dir, name, v);
    return v;
  }
}
```

- [ ] **Step 2: Add `removeReview` to `src/core/storage.ts`**

Add this export at the end of `src/core/storage.ts`:

```ts
export function removeReview(dir: string, name: string): void {
  for (const p of [logPath(dir, name), viewPath(dir, name)]) {
    if (fs.existsSync(p)) fs.rmSync(p);
  }
}
```

- [ ] **Step 3: Add a storage test for `removeReview`**

Append to `test/core/storage.test.ts` inside the `describe('storage', ...)` block:

```ts
  it('removes a review log and view', () => {
    storage.ensureLog(dir, 'rev');
    storage.writeView(dir, 'rev', { version: 1, name: 'rev', createdAt: '', threads: [] });
    storage.removeReview(dir, 'rev');
    expect(storage.listReviews(dir)).toEqual([]);
    expect(fs.existsSync(storage.viewPath(dir, 'rev'))).toBe(false);
  });
```

- [ ] **Step 4: Run storage tests and compile**

Run: `npx vitest run test/core/storage.test.ts && npm run compile`
Expected: storage tests PASS (7 tests); compile exits 0.

- [ ] **Step 5: Commit**

```bash
git add src/vscode/reviewService.ts src/core/storage.ts test/core/storage.test.ts
git commit -m "feat(vscode): review service orchestrating core"
```

---

## Task 8: Comments controller (gutter UI)

**Files:**
- Create: `src/vscode/commentsController.ts`

Renders the active review's threads for a document via the native Comments API, and exposes helpers the commands call. Anchors each thread with `anchor()`; outdated threads render at their stored line with an `[outdated]` label.

- [ ] **Step 1: Create `src/vscode/commentsController.ts`**

```ts
import * as vscode from 'vscode';
import { ReviewView, Thread } from '../core/types';
import { anchor } from '../core/anchor';

// Maps a VSCode comment thread back to our thread id so command handlers
// (reply/resolve) know which stored thread they act on.
export interface BoundThread {
  vsThread: vscode.CommentThread;
  threadId: string;
}

export class CommentsUI {
  private readonly controller: vscode.CommentController;
  private bound: BoundThread[] = [];

  constructor() {
    this.controller = vscode.comments.createCommentController('reviewComments', 'Code Review');
    this.controller.commentingRangeProvider = {
      provideCommentingRanges: (doc) => [new vscode.Range(0, 0, doc.lineCount - 1, 0)],
    };
  }

  dispose(): void {
    this.clear();
    this.controller.dispose();
  }

  threadIdFor(vsThread: vscode.CommentThread): string | undefined {
    return this.bound.find((b) => b.vsThread === vsThread)?.threadId;
  }

  private clear(): void {
    for (const b of this.bound) b.vsThread.dispose();
    this.bound = [];
  }

  // Re-render all threads of the view across currently open documents.
  render(view: ReviewView): void {
    this.clear();
    for (const doc of vscode.workspace.textDocuments) {
      const rel = vscode.workspace.asRelativePath(doc.uri, false);
      const lines = doc.getText().split('\n');
      for (const t of view.threads.filter((t) => t.file === rel)) {
        this.bound.push({ vsThread: this.renderThread(doc.uri, lines, t), threadId: t.id });
      }
    }
  }

  private renderThread(uri: vscode.Uri, lines: string[], t: Thread): vscode.CommentThread {
    const located = anchor(lines, t.range, t.snapshot);
    const range =
      located.kind === 'outdated'
        ? new vscode.Range(t.range.startLine - 1, 0, t.range.endLine - 1, 0)
        : new vscode.Range(located.range.startLine - 1, 0, located.range.endLine - 1, 0);

    const vsThread = this.controller.createCommentThread(
      uri,
      range,
      t.comments.map((c) => this.toComment(c.author, c.body)),
    );
    const outdated = located.kind === 'outdated' ? ' [outdated]' : '';
    vsThread.label = `${t.status === 'resolved' ? 'Resolved' : 'Open'}${outdated}`;
    vsThread.collapsibleState =
      t.status === 'resolved'
        ? vscode.CommentThreadCollapsibleState.Collapsed
        : vscode.CommentThreadCollapsibleState.Expanded;
    return vsThread;
  }

  private toComment(author: string, body: string): vscode.Comment {
    return {
      author: { name: author },
      body: new vscode.MarkdownString(body),
      mode: vscode.CommentMode.Preview,
    };
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run compile`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/vscode/commentsController.ts
git commit -m "feat(vscode): render threads via Comments API"
```

---

## Task 9: Tree provider (sidebar)

**Files:**
- Create: `src/vscode/treeProvider.ts`

- [ ] **Step 1: Create `src/vscode/treeProvider.ts`**

```ts
import * as vscode from 'vscode';
import { ReviewService } from './reviewService';

type Node =
  | { kind: 'review'; name: string }
  | { kind: 'thread'; review: string; threadId: string; label: string; file: string; line: number }
  | { kind: 'comment'; label: string };

export class ReviewTree implements vscode.TreeDataProvider<Node> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly service: ReviewService) {}

  refresh(): void {
    this.emitter.fire();
  }

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'review') {
      const active = this.service.active() === node.name;
      const item = new vscode.TreeItem(
        (active ? '● ' : '') + node.name,
        vscode.TreeItemCollapsibleState.Expanded,
      );
      item.contextValue = 'review';
      return item;
    }
    if (node.kind === 'thread') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.description = `${node.file}:${node.line}`;
      item.command = {
        command: 'vscode.open',
        title: 'Open',
        arguments: [
          vscode.Uri.joinPath(workspaceRoot(), node.file),
          { selection: new vscode.Range(node.line - 1, 0, node.line - 1, 0) },
        ],
      };
      return item;
    }
    return new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      return this.service.list().map((name) => ({ kind: 'review', name }));
    }
    if (node.kind === 'review') {
      return this.service.view(node.name).threads.map((t) => ({
        kind: 'thread',
        review: node.name,
        threadId: t.id,
        label: `${t.status === 'resolved' ? '✓' : '○'} ${t.comments[0]?.body ?? '(empty)'}`,
        file: t.file,
        line: t.range.startLine,
      }));
    }
    if (node.kind === 'thread') {
      const review = this.service.view(node.review);
      const thread = review.threads.find((t) => t.id === node.threadId);
      return (thread?.comments ?? []).map((c) => ({
        kind: 'comment',
        label: `${c.author}: ${c.body}`,
      }));
    }
    return [];
  }
}

function workspaceRoot(): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) throw new Error('No workspace folder open.');
  return folder.uri;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run compile`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/vscode/treeProvider.ts
git commit -m "feat(vscode): sidebar tree of reviews, threads, comments"
```

---

## Task 10: Commands + activation wiring

**Files:**
- Create: `src/vscode/commands.ts`
- Modify: `src/extension.ts` (replace contents)

- [ ] **Step 1: Create `src/vscode/commands.ts`**

```ts
import * as vscode from 'vscode';
import { ReviewService, nowIso } from './reviewService';
import { CommentsUI } from './commentsController';
import { ReviewTree } from './treeProvider';
import { newThreadId } from '../core/ids';

export function registerCommands(
  context: vscode.ExtensionContext,
  service: ReviewService,
  ui: CommentsUI,
  tree: ReviewTree,
): void {
  const refreshAll = () => {
    const name = service.active();
    ui.render(name ? service.view(name) : { version: 1, name: '', createdAt: '', threads: [] });
    tree.refresh();
  };

  const reg = (id: string, fn: (...args: any[]) => any) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  reg('review.refresh', refreshAll);

  reg('review.newReview', async () => {
    const name = await vscode.window.showInputBox({ prompt: 'Review name', placeHolder: 'auth-refactor' });
    if (!name) return;
    service.createReview(name.trim());
    refreshAll();
  });

  reg('review.switchActive', async () => {
    const names = service.list();
    if (names.length === 0) {
      vscode.window.showInformationMessage('No reviews yet. Create one first.');
      return;
    }
    const pick = await vscode.window.showQuickPick(names, { placeHolder: 'Activate review' });
    if (!pick) return;
    service.setActive(pick);
    refreshAll();
  });

  reg('review.deleteReview', async (node?: { name?: string }) => {
    const name = node?.name ?? (await vscode.window.showQuickPick(service.list(), { placeHolder: 'Delete review' }));
    if (!name) return;
    const ok = await vscode.window.showWarningMessage(`Delete review "${name}"?`, { modal: true }, 'Delete');
    if (ok !== 'Delete') return;
    service.deleteReview(name);
    refreshAll();
  });

  reg('review.addComment', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (!service.active()) {
      vscode.window.showWarningMessage('No active review. Run "Code Review: New Review" first.');
      return;
    }
    const body = await vscode.window.showInputBox({ prompt: 'Comment' });
    if (!body) return;

    const sel = editor.selection;
    const startLine = sel.start.line;
    const endLine = sel.isEmpty ? sel.start.line : sel.end.line;
    const snapshot = editor.document.getText(
      new vscode.Range(startLine, 0, endLine, editor.document.lineAt(endLine).text.length),
    );
    service.apply({
      op: 'add_thread',
      id: newThreadId(),
      file: vscode.workspace.asRelativePath(editor.document.uri, false),
      range: { startLine: startLine + 1, endLine: endLine + 1 },
      snapshot,
      author: 'reviewer',
      body,
      ts: nowIso(),
    });
    refreshAll();
  });

  reg('review.replySubmit', async (reply: vscode.CommentReply) => {
    const threadId = ui.threadIdFor(reply.thread);
    if (!threadId) return;
    service.apply({ op: 'reply', thread: threadId, author: 'reviewer', body: reply.text, ts: nowIso() });
    refreshAll();
  });

  reg('review.resolve', (thread: vscode.CommentThread) => {
    const threadId = ui.threadIdFor(thread);
    if (!threadId) return;
    service.apply({ op: 'resolve', thread: threadId, ts: nowIso() });
    refreshAll();
  });

  reg('review.reopen', (thread: vscode.CommentThread) => {
    const threadId = ui.threadIdFor(thread);
    if (!threadId) return;
    service.apply({ op: 'reopen', thread: threadId, ts: nowIso() });
    refreshAll();
  });
}
```

- [ ] **Step 2: Replace `src/extension.ts`**

```ts
import * as vscode from 'vscode';
import * as path from 'path';
import { ReviewService } from './vscode/reviewService';
import { CommentsUI } from './vscode/commentsController';
import { ReviewTree } from './vscode/treeProvider';
import { registerCommands } from './vscode/commands';

export function activate(context: vscode.ExtensionContext): void {
  const folder = vscode.workspace.workspaceFolders?.[0];
  if (!folder) return;

  const reviewDir = path.join(folder.uri.fsPath, '.review');
  const service = new ReviewService(reviewDir);
  const ui = new CommentsUI();
  const tree = new ReviewTree(service);

  context.subscriptions.push(ui);
  context.subscriptions.push(vscode.window.registerTreeDataProvider('reviewTree', tree));

  registerCommands(context, service, ui, tree);

  const rerender = () => vscode.commands.executeCommand('review.refresh');

  // Re-render when documents open (to anchor threads) and when the agent
  // writes to the .review directory out-of-band.
  context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(rerender));
  context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(rerender));

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, '.review/*.log.jsonl'),
  );
  watcher.onDidChange(rerender);
  watcher.onDidCreate(rerender);
  watcher.onDidDelete(rerender);
  context.subscriptions.push(watcher);

  rerender();
}

export function deactivate(): void {}
```

- [ ] **Step 3: Verify it compiles and builds**

Run: `npm run compile && npm run build`
Expected: both exit 0; `dist/extension.js` rebuilt.

- [ ] **Step 4: Commit**

```bash
git add src/vscode/commands.ts src/extension.ts
git commit -m "feat(vscode): commands, activation, file watcher"
```

---

## Task 11: Manual end-to-end verification

**Files:** none (manual launch).

- [ ] **Step 1: Create a `.vscode/launch.json` for the Extension Development Host**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Run Extension",
      "type": "extensionHost",
      "request": "launch",
      "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
      "outFiles": ["${workspaceFolder}/dist/**/*.js"],
      "preLaunchTask": "${defaultBuildTask}"
    }
  ]
}
```

- [ ] **Step 2: Build, then launch with F5**

Run: `npm run build`
Then press F5 in VSCode. A second "Extension Development Host" window opens. Open any folder with code in it.

- [ ] **Step 3: Walk the use cases (from the spec) and confirm each**

Verify, checking the box only after observing the result:
- New Review (sidebar `+` → name it) → appears in tree, marked `●` active; `.review/<name>.log.jsonl`, `.view.json`, `state.json` created.
- Select lines → right-click → "Code Review: Add Comment" → type text → gutter thread appears; tree shows the thread; `.view.json` contains it.
- Reply in the gutter thread → second comment appears; `.log.jsonl` has a `reply` line.
- Resolve via thread title → label flips to "Resolved"; tree marker `✓`.
- Edit the file above the comment to shift its lines, save → thread re-anchors to the moved code (not the old line).
- Delete the commented code, save → thread shows `[outdated]`, still visible.
- Externally append a `reply` event to the active `.log.jsonl` (simulating an agent) → UI updates within a moment via the watcher.

- [ ] **Step 4: Commit the launch config**

```bash
git add .vscode/launch.json
git commit -m "chore: add extension dev launch config"
```

---

## Task 12: Agent jq skill

**Files:**
- Create: `.claude/skills/review-comments/SKILL.md`

- [ ] **Step 1: Create `.claude/skills/review-comments/SKILL.md`**

````markdown
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
````

- [ ] **Step 2: Validate the documented commands against a real review**

With a `.review/` produced by Task 11 still present (or recreate one), run the
"Read open threads", "reply", and "resolve" snippets manually.
Run: `f=$(jq -r .active .review/state.json); jq '.threads[]' ".review/$f.view.json"`
Expected: prints the thread(s) as JSON without error. Append a reply, then reload
the Extension Development Host window — the reply appears.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/review-comments/SKILL.md
git commit -m "docs: agent jq skill for review comments"
```

---

## Task 13: Fill AGENTS.md

**Files:**
- Modify: `AGENTS.md` (replace the TBD sections)

- [ ] **Step 1: Replace the TBD sections in `AGENTS.md`**

Replace everything from `## Repository status` to the end of the file with:

```markdown
## Repository status

Active. v0.x — VSCode extension for local, GitHub-style code review whose output
is a workspace JSON that AI agents read and resolve.

## Project structure

- `src/core/` — VSCode-agnostic: `types`, `events` (fold), `anchor`, `storage`, `ids`. Unit-tested with vitest.
- `src/vscode/` — adapter: `reviewService`, `commentsController`, `treeProvider`, `commands`.
- `src/extension.ts` — composition root (activation, watcher, wiring).
- `test/core/` — vitest unit tests for the core.
- `.claude/skills/review-comments/` — agent jq contract for the `.review/` files.
- `docs/superpowers/` — specs and plans.

## Dependencies and tests

- Build: `npm run build` (esbuild → `dist/extension.js`). Typecheck: `npm run compile`.
- Tests: `npm test` (vitest, core only). Run from F5 ("Run Extension") for manual UI checks.
- Agent side requires `jq`.

## Conventions

- Keep `src/core/` free of `vscode` imports so it stays unit-testable and reusable.
- The append-only log (`.review/<name>.log.jsonl`) is the source of truth; the
  extension is the sole writer of `<name>.view.json`. All writes (UI and agent)
  append events — never rewrite shared state.
- TDD for core modules. 1-based line ranges. ISO-8601 UTC timestamps via `nowIso()`.
```

- [ ] **Step 2: Commit**

```bash
git add AGENTS.md
git commit -m "docs: fill AGENTS.md project guidance"
```

---

## Self-Review Notes

- **Spec coverage:** ad-hoc commenting (Task 10), single active + multiple reviews + pointer (Tasks 5, 7, 10), anchoring exact/relocate/outdated (Tasks 4, 8), threads + replies + status (Tasks 3, 8, 10), event-log persistence + atomic append + derived view (Task 5), concurrency via append-only + watcher (Tasks 5, 10), Comments API UI (Task 8), tree + commands (Tasks 9, 10), jq agent skill (Task 12), VSCode-agnostic core for future Zed/LSP (Tasks 2–6). Diff mode + Zed are explicitly out of scope (spec) — no tasks, intentionally.
- **Type consistency:** `ReviewService.apply(event)` takes the active review implicitly; `view(name)`/`createReview(name)`/`deleteReview(name)` take a name. `CommentsUI.threadIdFor` ↔ `BoundThread`. `newThreadId(rand?)`. `nowIso()` is the only `Date` touch-point. Storage exports (`logPath`/`viewPath`/`statePath`/`ensureLog`/`appendEvent`/`readLog`/`writeView`/`readState`/`writeState`/`listReviews`/`removeReview`) are used consistently.
- **No placeholders:** every code step contains full code; commands have expected output.
```
