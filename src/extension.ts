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
