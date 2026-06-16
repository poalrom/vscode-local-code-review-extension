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
  const renderNow = () => {
    const view = service.refreshView();
    ui.render(view ?? { version: 1, name: '', createdAt: '', threads: [] });
    tree.refresh();
  };

  // Coalesce render bursts: a user action appends to the log, which also fires
  // the file watcher; debouncing merges both into one render and satisfies the
  // spec's "debounced" re-anchoring on save.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const scheduleRender = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(renderNow, 100);
  };
  context.subscriptions.push({ dispose: () => { if (timer) clearTimeout(timer); } });

  const reg = (id: string, fn: (...args: any[]) => any) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  // Ensure a review is active, prompting to create one (with a collision-safe
  // default name) when there isn't. Returns false if the user cancels.
  const ensureActiveReview = async (): Promise<boolean> => {
    if (service.active()) return true;
    const name = await vscode.window.showInputBox({
      prompt: 'No active review. Name a new review for this comment',
      value: service.suggestReviewName(),
    });
    if (!name) return false;
    service.createReview(name.trim());
    return true;
  };

  reg('review.refresh', scheduleRender);

  reg('review.newReview', async () => {
    const name = await vscode.window.showInputBox({ prompt: 'Review name', placeHolder: 'auth-refactor' });
    if (!name) return;
    service.createReview(name.trim());
    scheduleRender();
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
    scheduleRender();
  });

  reg('review.deleteReview', async (node?: { name?: string }) => {
    const name = node?.name ?? (await vscode.window.showQuickPick(service.list(), { placeHolder: 'Delete review' }));
    if (!name) return;
    const ok = await vscode.window.showWarningMessage(`Delete review "${name}"?`, { modal: true }, 'Delete');
    if (ok !== 'Delete') return;
    service.deleteReview(name);
    scheduleRender();
  });

  reg('review.addComment', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return;
    if (!(await ensureActiveReview())) return;
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
    scheduleRender();
  });

  reg('review.replySubmit', async (reply: vscode.CommentReply) => {
    const threadId = ui.threadIdFor(reply.thread);
    if (threadId) {
      service.apply({ op: 'reply', thread: threadId, author: 'reviewer', body: reply.text, ts: nowIso() });
      scheduleRender();
      return;
    }
    // Unbound thread = the user started a fresh comment from the gutter UI.
    // Treat it as a new review thread, creating a review to hold it if needed.
    if (!(await ensureActiveReview())) return;
    const doc = await vscode.workspace.openTextDocument(reply.thread.uri);
    const range = reply.thread.range ?? new vscode.Range(0, 0, 0, 0);
    const startLine = range.start.line;
    const endLine = range.end.line;
    const snapshot = doc.getText(
      new vscode.Range(startLine, 0, endLine, doc.lineAt(endLine).text.length),
    );
    service.apply({
      op: 'add_thread',
      id: newThreadId(),
      file: vscode.workspace.asRelativePath(reply.thread.uri, false),
      range: { startLine: startLine + 1, endLine: endLine + 1 },
      snapshot,
      author: 'reviewer',
      body: reply.text,
      ts: nowIso(),
    });
    // Drop the transient editor-created thread; render() recreates a bound one.
    reply.thread.dispose();
    scheduleRender();
  });

  reg('review.resolve', (thread: vscode.CommentThread) => {
    const threadId = ui.threadIdFor(thread);
    if (!threadId) return;
    service.apply({ op: 'resolve', thread: threadId, ts: nowIso() });
    scheduleRender();
  });

  reg('review.reopen', (thread: vscode.CommentThread) => {
    const threadId = ui.threadIdFor(thread);
    if (!threadId) return;
    service.apply({ op: 'reopen', thread: threadId, ts: nowIso() });
    scheduleRender();
  });
}
