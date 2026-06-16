import * as vscode from 'vscode';
import { ReviewView, Thread, ThreadStatus } from '../core/types';
import { anchor } from '../core/anchor';

// Maps a VSCode comment thread back to our thread id so command handlers
// (reply/resolve) know which stored thread they act on. `sig` and `status`
// capture the last-rendered state so re-renders can skip unchanged threads
// instead of disposing+recreating them (which the editor shows as blinking).
export interface BoundThread {
  vsThread: vscode.CommentThread;
  threadId: string;
  sig: string;
  status: ThreadStatus;
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

  // Reconcile rendered threads against the view. Threads are matched by id so
  // unchanged ones are left untouched, changed ones are updated in place, and
  // only genuinely removed ones are disposed. A full teardown+rebuild would
  // make every live widget flash open/closed on each render (the blink bug).
  render(view: ReviewView): void {
    const desired = new Map<string, { uri: vscode.Uri; lines: string[]; t: Thread }>();
    for (const doc of vscode.workspace.textDocuments) {
      const rel = vscode.workspace.asRelativePath(doc.uri, false);
      const lines = doc.getText().split('\n');
      for (const t of view.threads) {
        if (t.file === rel) desired.set(t.id, { uri: doc.uri, lines, t });
      }
    }

    // Dispose threads that no longer have a place in the view.
    this.bound = this.bound.filter((b) => {
      if (desired.has(b.threadId)) return true;
      b.vsThread.dispose();
      return false;
    });

    for (const [id, { uri, lines, t }] of desired) {
      const r = this.placement(lines, t);
      const sig = JSON.stringify({
        line: [r.startLine, r.endLine],
        label: r.label,
        comments: t.comments.map((c) => [c.author, c.body]),
      });
      const existing = this.bound.find((b) => b.threadId === id);
      const range = new vscode.Range(r.startLine, 0, r.endLine, 0);

      if (!existing) {
        const vsThread = this.controller.createCommentThread(
          uri,
          range,
          t.comments.map((c) => this.toComment(c.author, c.body)),
        );
        vsThread.label = r.label;
        vsThread.contextValue = t.status;
        vsThread.collapsibleState = collapsibleFor(t.status);
        this.bound.push({ vsThread, threadId: id, sig, status: t.status });
        continue;
      }

      // Nothing changed — leave the live widget (and its collapse state) alone.
      if (existing.sig === sig && existing.status === t.status) continue;

      existing.vsThread.range = range;
      existing.vsThread.label = r.label;
      existing.vsThread.contextValue = t.status;
      existing.vsThread.comments = t.comments.map((c) => this.toComment(c.author, c.body));
      // Only override the user's collapse state when the status itself flips.
      if (existing.status !== t.status) {
        existing.vsThread.collapsibleState = collapsibleFor(t.status);
      }
      existing.sig = sig;
      existing.status = t.status;
    }
  }

  // Anchor the thread in the current document text and derive its label.
  private placement(lines: string[], t: Thread): { startLine: number; endLine: number; label: string } {
    const located = anchor(lines, t.range, t.snapshot);
    const outdated = located.kind === 'outdated';
    const range = outdated ? t.range : located.range;
    return {
      startLine: range.startLine - 1,
      endLine: range.endLine - 1,
      label: `${t.status === 'resolved' ? 'Resolved' : 'Open'}${outdated ? ' [outdated]' : ''}`,
    };
  }

  private toComment(author: string, body: string): vscode.Comment {
    return {
      author: { name: author },
      body: new vscode.MarkdownString(body),
      mode: vscode.CommentMode.Preview,
    };
  }
}

function collapsibleFor(status: ThreadStatus): vscode.CommentThreadCollapsibleState {
  return status === 'resolved'
    ? vscode.CommentThreadCollapsibleState.Collapsed
    : vscode.CommentThreadCollapsibleState.Expanded;
}
