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
