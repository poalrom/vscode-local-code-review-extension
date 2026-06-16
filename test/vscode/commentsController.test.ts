import { beforeEach, describe, expect, it } from 'vitest';
import { CommentsUI } from '../../src/vscode/commentsController';
import { ReviewView, Thread } from '../../src/core/types';
import * as mock from '../vscode-mock';

function doc(rel: string, text: string) {
  return { uri: { _rel: rel }, getText: () => text };
}

function openThread(overrides: Partial<Thread> = {}): Thread {
  return {
    id: 't1',
    file: 'a.ts',
    range: { startLine: 1, endLine: 1 },
    snapshot: 'l1',
    status: 'open',
    createdAt: '2026-06-16T00:00:00.000Z',
    comments: [{ id: 't1.c1', author: 'reviewer', body: 'qwe', createdAt: '2026-06-16T00:00:00.000Z' }],
    ...overrides,
  };
}

function view(threads: Thread[]): ReviewView {
  return { version: 1, name: 'r', createdAt: '', threads };
}

const alive = () => mock.state.createdThreads.filter((t) => !t.disposed);

describe('CommentsUI.render', () => {
  beforeEach(() => {
    mock.__reset();
    mock.state.textDocuments = [doc('a.ts', 'l1\nl2\nl3\nl4\nl5\n')];
  });

  it('does not tear down and recreate unchanged threads on repeated renders', () => {
    const ui = new CommentsUI();
    const v = view([openThread()]);

    ui.render(v);
    expect(mock.state.createdThreads.length).toBe(1);

    // A second identical render (a save/open/watcher trigger fires) must reuse
    // the live thread, not dispose+recreate it. Recreation is the blink.
    ui.render(v);
    expect(mock.state.createdThreads.length).toBe(1);
    expect(alive().length).toBe(1);
    expect(mock.state.createdThreads[0].disposed).toBe(false);
  });

  it('disposes threads that disappear from the view', () => {
    const ui = new CommentsUI();
    ui.render(view([openThread()]));
    ui.render(view([]));
    expect(alive().length).toBe(0);
  });

  it('updates a shifted thread in place without recreating it (no blink)', () => {
    const ui = new CommentsUI();
    ui.render(view([openThread()]));

    // Insert a line above the comment: VSCode live-tracks the decoration, so we
    // just move the range in place rather than dispose+recreate.
    mock.state.textDocuments = [doc('a.ts', 'x\nl1\nl2\nl3\nl4\nl5\n')];
    ui.render(view([openThread()]));

    expect(mock.state.createdThreads.length).toBe(1);
    expect(alive().length).toBe(1);
    expect(mock.state.createdThreads[0].disposed).toBe(false);
    expect((alive()[0].range as { start: { line: number } }).start.line).toBe(1);
  });

  it('recreates a thread when it flips out of the outdated state', () => {
    const ui = new CommentsUI();
    ui.render(view([openThread()]));

    // Snapshot vanishes -> entering outdated updates in place (still one thread).
    mock.state.textDocuments = [doc('a.ts', 'gone\nl2\nl3\nl4\nl5\n')];
    ui.render(view([openThread()]));
    expect(mock.state.createdThreads.length).toBe(1);

    // Snapshot reappears -> recreate so VSCode re-places the stranded widget.
    mock.state.textDocuments = [doc('a.ts', 'l1\nl2\nl3\nl4\nl5\n')];
    ui.render(view([openThread()]));
    expect(mock.state.createdThreads.length).toBe(2);
    expect(alive().length).toBe(1);
    expect(mock.state.createdThreads[0].disposed).toBe(true);
  });

  it('leaves an unchanged thread untouched on repeated renders (no blink)', () => {
    const ui = new CommentsUI();
    const v = view([openThread()]);
    ui.render(v);
    ui.render(v);

    expect(mock.state.createdThreads.length).toBe(1);
    expect(mock.state.createdThreads[0].disposed).toBe(false);
  });

  it('disposes a thread once it is resolved (hidden from the comments UI)', () => {
    const ui = new CommentsUI();
    ui.render(view([openThread()]));
    expect(alive().length).toBe(1);

    ui.render(view([openThread({ status: 'resolved' })]));
    expect(alive().length).toBe(0);
  });

  it('never creates a widget for an already-resolved thread', () => {
    const ui = new CommentsUI();
    ui.render(view([openThread({ status: 'resolved' })]));
    expect(mock.state.createdThreads.length).toBe(0);
  });
});
