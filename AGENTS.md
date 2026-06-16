# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

## Design principles

This repository follows the **[Zen of Program Design](SW_ZEN.md)** — read it and apply it when designing, implementing, and reviewing code.

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