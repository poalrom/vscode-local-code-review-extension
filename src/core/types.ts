// 1-based inclusive line range, matching editor display.
export interface LineRange {
  startLine: number;
  endLine: number;
}

export type ThreadStatus = 'open' | 'resolved';

export interface Comment {
  id: string;
  author: string; // 'reviewer' | 'agent' by convention
  body: string;
  createdAt: string; // ISO-8601 UTC
  editedAt?: string; // ISO-8601 UTC, set when the body was edited
}

export interface Thread {
  id: string;
  file: string; // workspace-relative path
  range: LineRange;
  snapshot: string; // exact commented text, drives anchoring
  status: ThreadStatus;
  createdAt: string;
  comments: Comment[];
}

export interface ReviewView {
  version: 1;
  name: string;
  createdAt: string;
  threads: Thread[];
}

export interface AddThreadEvent {
  op: 'add_thread';
  id: string;
  file: string;
  range: LineRange;
  snapshot: string;
  author: string;
  body: string;
  ts: string;
}

export interface ReplyEvent {
  op: 'reply';
  thread: string; // thread id
  author: string;
  body: string;
  ts: string;
}

export interface ResolveEvent {
  op: 'resolve';
  thread: string;
  ts: string;
}

export interface ReopenEvent {
  op: 'reopen';
  thread: string;
  ts: string;
}

// Edits a comment's body only. Targets the comment by its full id
// (`<thread>.c<N>`); the thread is derived from that id. Carries no author —
// editing never changes who wrote the comment.
export interface EditCommentEvent {
  op: 'edit_comment';
  comment: string; // full comment id, e.g. 't_1.c2'
  body: string;
  ts: string;
}

export type ReviewEvent =
  | AddThreadEvent
  | ReplyEvent
  | ResolveEvent
  | ReopenEvent
  | EditCommentEvent;
