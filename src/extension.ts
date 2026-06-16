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

  // Watch the .review directory itself: deleting the whole folder doesn't
  // reliably emit per-file delete events for the log watcher above. Create/
  // delete only — ignore change events so the extension's own view/state
  // writes inside the folder don't trigger a render loop.
  const dirWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, '.review'),
    false,
    true,
    false,
  );
  dirWatcher.onDidCreate(rerender);
  dirWatcher.onDidDelete(rerender);
  context.subscriptions.push(dirWatcher);

  // view.json is a derived snapshot the extension owns. If the user deletes it
  // by hand, regenerate it. Delete-only: the extension's own atomic writes
  // surface as change/create events (ignored here), so this can't self-loop.
  const viewWatcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(folder, '.review/*.view.json'),
    true,
    true,
    false,
  );
  viewWatcher.onDidDelete(rerender);
  context.subscriptions.push(viewWatcher);

  rerender();
}

export function deactivate(): void {}
