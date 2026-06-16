import { ReviewEvent, ReviewView } from '../core/types';
import { fold } from '../core/events';
import * as storage from '../core/storage';

// ISO-8601 UTC timestamp, wrapped so callers don't touch Date directly.
export function nowIso(): string {
  return new Date().toISOString();
}

export class ReviewService {
  constructor(private readonly dir: string) {}

  active(): string | null {
    return storage.readState(this.dir).active;
  }

  list(): string[] {
    return storage.listReviews(this.dir);
  }

  setActive(name: string): void {
    storage.writeState(this.dir, { active: name });
  }

  createReview(name: string): void {
    storage.ensureLog(this.dir, name);
    storage.writeView(this.dir, name, this.view(name));
    this.setActive(name);
  }

  // A date-based default review name that doesn't collide with an existing one.
  // Used when a comment is added with no active review and we offer a name to create.
  suggestReviewName(): string {
    const base = `review-${nowIso().slice(0, 10)}`;
    const existing = new Set(this.list());
    if (!existing.has(base)) return base;
    for (let i = 2; ; i++) {
      const candidate = `${base}-${i}`;
      if (!existing.has(candidate)) return candidate;
    }
  }

  deleteReview(name: string): void {
    const wasActive = this.active();
    storage.removeReview(this.dir, name);
    if (wasActive === name) {
      const remaining = this.list();
      storage.writeState(this.dir, { active: remaining[0] ?? null });
    }
  }

  view(name: string): ReviewView {
    return fold(name, storage.readLog(this.dir, name));
  }

  // Recompute and persist the active review's view. Safe to call on every
  // render — used to keep view.json current after external (agent) log writes.
  refreshView(): ReviewView | null {
    const name = this.active();
    if (!name) return null;
    const v = this.view(name);
    storage.writeView(this.dir, name, v);
    return v;
  }

  // Append an event to a review (defaults to the active one), rebuild + persist
  // its view, return it. Pass `target` to act on a non-active review, e.g. from
  // the tree panel context menu.
  apply(event: ReviewEvent, target?: string): ReviewView {
    const name = target ?? this.active();
    if (!name) throw new Error('No active review. Create one first.');
    storage.appendEvent(this.dir, name, event);
    const v = this.view(name);
    storage.writeView(this.dir, name, v);
    return v;
  }
}
