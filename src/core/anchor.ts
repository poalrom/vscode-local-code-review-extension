import { LineRange } from './types';

export type AnchorResult =
  | { kind: 'exact'; range: LineRange }
  | { kind: 'relocated'; range: LineRange }
  | { kind: 'outdated' };

export function anchor(docLines: string[], range: LineRange, snapshot: string): AnchorResult {
  // Normalize line endings so matching works regardless of CRLF vs LF: callers
  // split doc text on '\n', which leaves a trailing '\r' on CRLF files.
  docLines = docLines.map(stripCr);
  const snapLines = snapshot.split('\n').map(stripCr);
  const height = snapLines.length;

  // Derive endLine from the snapshot height, not the stored range. The snapshot
  // is authoritative, so an exact match must report the same height a relocated
  // match would — otherwise the two paths can return different endLine values.
  if (matchesAt(docLines, range.startLine - 1, snapLines)) {
    return { kind: 'exact', range: { startLine: range.startLine, endLine: range.startLine + height - 1 } };
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

function stripCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function matchesAt(docLines: string[], start: number, snapLines: string[]): boolean {
  if (start < 0 || start + snapLines.length > docLines.length) return false;
  for (let j = 0; j < snapLines.length; j++) {
    if (docLines[start + j] !== snapLines[j]) return false;
  }
  return true;
}
