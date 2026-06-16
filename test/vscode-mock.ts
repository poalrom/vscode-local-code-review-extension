// Minimal in-memory stand-in for the `vscode` module, aliased in via
// vitest.config.ts so the Comments API adapter can be unit-tested without the
// Extension Host. Only the surface used by commentsController.ts is modeled.

export class Range {
  constructor(
    public readonly startLine: number,
    public readonly startCol: number,
    public readonly endLine: number,
    public readonly endCol: number,
  ) {}
}

export class MarkdownString {
  constructor(public readonly value: string) {}
}

export const CommentMode = { Editing: 0, Preview: 1 } as const;
export const CommentThreadCollapsibleState = { Collapsed: 0, Expanded: 1 } as const;

export interface MockThread {
  uri: unknown;
  range: unknown;
  comments: unknown[];
  label?: string;
  collapsibleState?: number;
  disposed: boolean;
  dispose(): void;
}

export const state: {
  createdThreads: MockThread[];
  controllerDisposed: boolean;
  textDocuments: Array<{ uri: { _rel: string }; getText(): string }>;
} = {
  createdThreads: [],
  controllerDisposed: false,
  textDocuments: [],
};

export function __reset(): void {
  state.createdThreads = [];
  state.controllerDisposed = false;
  state.textDocuments = [];
}

export const comments = {
  createCommentController() {
    return {
      commentingRangeProvider: undefined as unknown,
      createCommentThread(uri: unknown, range: unknown, comments: unknown[]): MockThread {
        const t: MockThread = {
          uri,
          range,
          comments,
          disposed: false,
          dispose() {
            this.disposed = true;
          },
        };
        state.createdThreads.push(t);
        return t;
      },
      dispose() {
        state.controllerDisposed = true;
      },
    };
  },
};

export const workspace = {
  get textDocuments() {
    return state.textDocuments;
  },
  asRelativePath(uri: { _rel: string }) {
    return uri._rel;
  },
};
