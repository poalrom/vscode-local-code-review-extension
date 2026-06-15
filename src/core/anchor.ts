import { LineRange } from './types';

export type AnchorResult =
  | { kind: 'exact'; range: LineRange }
  | { kind: 'relocated'; range: LineRange }
  | { kind: 'outdated' };

export function anchor(docLines: string[], range: LineRange, snapshot: string): AnchorResult {
  const snapLines = snapshot.split('\n');
  const height = snapLines.length;

  if (matchesAt(docLines, range.startLine - 1, snapLines)) {
    return { kind: 'exact', range };
  }

  const matches: number[] = [];
  for (let i = 0; i + height <= docLines.length; i++) {
    if (matchesAt(docLines, i, snapLines)) matches.push(i);
  }

  if (matches.length > 0) {
    const storedStart = range.startLine - 1;
    let best = matches[0];
    for (const m of matches) {
      if (Math.abs(m - storedStart) < Math.abs(best - storedStart)) best = m;
    }
    return { kind: 'relocated', range: { startLine: best + 1, endLine: best + height } };
  }

  return { kind: 'outdated' };
}

function matchesAt(docLines: string[], start: number, snapLines: string[]): boolean {
  if (start < 0 || start + snapLines.length > docLines.length) return false;
  for (let j = 0; j < snapLines.length; j++) {
    if (docLines[start + j] !== snapLines[j]) return false;
  }
  return true;
}
