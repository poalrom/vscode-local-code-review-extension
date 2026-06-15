import * as fs from 'fs';
import * as path from 'path';
import { ReviewEvent, ReviewView } from './types';

export interface ReviewState {
  active: string | null;
}

export function logPath(dir: string, name: string): string {
  return path.join(dir, `${name}.log.jsonl`);
}
export function viewPath(dir: string, name: string): string {
  return path.join(dir, `${name}.view.json`);
}
export function statePath(dir: string): string {
  return path.join(dir, 'state.json');
}

export function ensureLog(dir: string, name: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const p = logPath(dir, name);
  if (!fs.existsSync(p)) fs.writeFileSync(p, '');
}

export function appendEvent(dir: string, name: string, event: ReviewEvent): void {
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(logPath(dir, name), JSON.stringify(event) + '\n');
}

export function readLog(dir: string, name: string): ReviewEvent[] {
  const p = logPath(dir, name);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ReviewEvent);
}

function writeAtomic(target: string, contents: string): void {
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, target);
}

export function writeView(dir: string, name: string, view: ReviewView): void {
  fs.mkdirSync(dir, { recursive: true });
  writeAtomic(viewPath(dir, name), JSON.stringify(view, null, 2));
}

export function readState(dir: string): ReviewState {
  const p = statePath(dir);
  if (!fs.existsSync(p)) return { active: null };
  return JSON.parse(fs.readFileSync(p, 'utf8')) as ReviewState;
}

export function writeState(dir: string, state: ReviewState): void {
  fs.mkdirSync(dir, { recursive: true });
  writeAtomic(statePath(dir), JSON.stringify(state, null, 2));
}

export function listReviews(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const suffix = '.log.jsonl';
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(suffix))
    .map((f) => f.slice(0, -suffix.length))
    .sort();
}
