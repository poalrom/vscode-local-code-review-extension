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

  it('updates a changed thread in place without recreating it', () => {
    const ui = new CommentsUI();
    ui.render(view([openThread()]));
    const resolved = openThread({ status: 'resolved' });
    ui.render(view([resolved]));

    expect(mock.state.createdThreads.length).toBe(1);
    expect(mock.state.createdThreads[0].label).toContain('Resolved');
    expect(mock.state.createdThreads[0].collapsibleState).toBe(
      mock.CommentThreadCollapsibleState.Collapsed,
    );
  });
});
