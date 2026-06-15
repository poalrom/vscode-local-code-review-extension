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
