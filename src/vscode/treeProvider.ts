import * as vscode from 'vscode';
import { ReviewService } from './reviewService';
import { anchor } from '../core/anchor';
import { Thread } from '../core/types';

export type Node =
  | { kind: 'review'; name: string }
  | { kind: 'thread'; review: string; threadId: string; label: string; file: string; line: number; status: 'open' | 'resolved'; outdated: boolean }
  | { kind: 'comment'; label: string };

export class ReviewTree implements vscode.TreeDataProvider<Node> {
  private readonly emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  // VSCode persists each element's expansion state across refreshes, keyed by
  // TreeItem.id. Threads carry this generation in their id; bumping it on a
  // review expand makes VSCode treat every thread as new, so the provided
  // Collapsed state wins and threads come back collapsed.
  private threadGen = 0;

  constructor(private readonly service: ReviewService) {}

  refresh(): void {
    this.emitter.fire();
  }

  // Wired to TreeView collapse/expand events. Bump the generation when a review
  // collapses (while its threads are hidden) so they get fresh ids and re-render
  // collapsed on the next expand — no flash of the previous expanded state.
  onElementCollapsed(node: Node): void {
    if (node.kind !== 'review') return;
    this.threadGen++;
    this.refresh();
  }

  onElementExpanded(_node: Node): void {}

  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === 'review') {
      const active = this.service.active() === node.name;
      const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Expanded);
      item.label = (active ? '● ' : '') + node.name;
      // Stable id so VSCode keeps the user's expand/collapse choice for reviews.
      item.id = `review/${node.name}`;
      item.contextValue = 'review';
      return item;
    }
    if (node.kind === 'thread') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.id = `thread/${this.threadGen}/${node.review}/${node.threadId}`;
      item.contextValue = node.status === 'resolved' ? 'thread-resolved' : 'thread-open';
      item.description = `${node.file}:${node.line}${node.outdated ? ' [outdated]' : ''}`;
      if (node.outdated) {
        item.iconPath = new vscode.ThemeIcon(
          'warning',
          new vscode.ThemeColor('list.warningForeground'),
        );
      }
      const root = vscode.workspace.workspaceFolders?.[0]?.uri;
      if (root) {
        item.command = {
          command: 'vscode.open',
          title: 'Open',
          arguments: [
            vscode.Uri.joinPath(root, node.file),
            { selection: new vscode.Range(node.line - 1, 0, node.line - 1, 0) },
          ],
        };
      }
      return item;
    }
    return new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      return this.service.list().map((name) => ({ kind: 'review', name }));
    }
    if (node.kind === 'review') {
      return this.service.view(node.name).threads.map((t) => {
        const placed = this.locate(t);
        return {
          kind: 'thread',
          review: node.name,
          threadId: t.id,
          label: `${t.status === 'resolved' ? '✓' : '○'} ${t.comments[0]?.body ?? '(empty)'}`,
          file: t.file,
          line: placed.line,
          status: t.status,
          outdated: placed.outdated,
        };
      });
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

  // Re-anchor the thread against the open document's current text so the tree's
  // line matches the editor. Falls back to the stored line when the file isn't
  // open or the snapshot can no longer be found (outdated). `outdated` is only
  // known when the file is open — otherwise we can't tell, so it stays false.
  private locate(t: Thread): { line: number; outdated: boolean } {
    const doc = vscode.workspace.textDocuments.find(
      (d) => vscode.workspace.asRelativePath(d.uri, false) === t.file,
    );
    if (!doc) return { line: t.range.startLine, outdated: false };
    const located = anchor(doc.getText().split('\n'), t.range, t.snapshot);
    return located.kind === 'outdated'
      ? { line: t.range.startLine, outdated: true }
      : { line: located.range.startLine, outdated: false };
  }
}
