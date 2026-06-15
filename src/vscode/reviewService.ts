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

  // Append an event to the active review, rebuild + persist the view, return it.
  apply(event: ReviewEvent): ReviewView {
    const name = this.active();
    if (!name) throw new Error('No active review. Create one first.');
    storage.appendEvent(this.dir, name, event);
    const v = this.view(name);
    storage.writeView(this.dir, name, v);
    return v;
  }
}
