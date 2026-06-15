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
