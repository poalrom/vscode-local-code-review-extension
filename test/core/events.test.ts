import { describe, it, expect } from 'vitest';
import { fold } from '../../src/core/events';
import { ReviewEvent } from '../../src/core/types';

const add: ReviewEvent = {
  op: 'add_thread', id: 't_1', file: 'a.ts',
  range: { startLine: 1, endLine: 2 }, snapshot: 'x\ny',
  author: 'reviewer', body: 'fix this', ts: '2026-06-15T10:00:00Z',
};

describe('fold', () => {
  it('creates a thread with its first comment from add_thread', () => {
    const v = fold('rev', [add]);
    expect(v.name).toBe('rev');
    expect(v.threads).toHaveLength(1);
    const t = v.threads[0];
    expect(t.id).toBe('t_1');
    expect(t.status).toBe('open');
    expect(t.comments).toEqual([
      { id: 't_1.c1', author: 'reviewer', body: 'fix this', createdAt: '2026-06-15T10:00:00Z' },
    ]);
  });

  it('appends replies with sequential comment ids', () => {
    const v = fold('rev', [
      add,
      { op: 'reply', thread: 't_1', author: 'agent', body: 'done', ts: '2026-06-15T10:05:00Z' },
    ]);
    expect(v.threads[0].comments.map((c) => c.id)).toEqual(['t_1.c1', 't_1.c2']);
    expect(v.threads[0].comments[1].author).toBe('agent');
  });

  it('applies resolve and reopen', () => {
    const resolved = fold('rev', [add, { op: 'resolve', thread: 't_1', ts: 't1' }]);
    expect(resolved.threads[0].status).toBe('resolved');
    const reopened = fold('rev', [add, { op: 'resolve', thread: 't_1', ts: 't1' }, { op: 'reopen', thread: 't_1', ts: 't2' }]);
    expect(reopened.threads[0].status).toBe('open');
  });

  it('ignores events referencing unknown threads', () => {
    const v = fold('rev', [{ op: 'reply', thread: 'ghost', author: 'agent', body: 'x', ts: 't' }]);
    expect(v.threads).toHaveLength(0);
  });

  it('ignores duplicate add_thread for same id', () => {
    const v = fold('rev', [add, { ...add, body: 'second' }]);
    expect(v.threads).toHaveLength(1);
    expect(v.threads[0].comments).toHaveLength(1);
  });

  it('preserves creation order of threads', () => {
    const second: ReviewEvent = { ...add, id: 't_2', ts: '2026-06-15T11:00:00Z' };
    const v = fold('rev', [add, second]);
    expect(v.threads.map((t) => t.id)).toEqual(['t_1', 't_2']);
  });

  it('returns an empty view with blank createdAt for no events', () => {
    const v = fold('rev', []);
    expect(v).toEqual({ version: 1, name: 'rev', createdAt: '', threads: [] });
  });
});
