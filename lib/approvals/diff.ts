import type { DiffToken } from './dossier/types';

/**
 * Word-level difference between two drafts.
 *
 * Character diffs are unreadable in prose and line diffs are useless for it —
 * narration is written in long paragraphs, so a one-word change would light up
 * the whole line. Words are the unit an editor actually thinks in.
 *
 * Whitespace is carried on the token it follows, so joining the tokens
 * reproduces the original text exactly. That matters: the "after" column of a
 * diff has to be readable *as the script*, not as a list of fragments.
 */

/** Splits into words with their trailing whitespace attached. */
export function tokenise(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [];
}

/**
 * Longest common subsequence over tokens.
 *
 * Bounded deliberately. The table is O(n·m), and a pair of 4,000-word sections
 * is 16 million cells — enough to stall a request for a diff nobody can read
 * anyway. Past the bound the sections are reported as wholly changed, which is
 * honest and instant.
 */
const MAX_TOKENS = 2500;

export interface WordDiff {
  before: DiffToken[];
  after: DiffToken[];
  /** Tokens that differ, as a share of the larger side. 0 when identical. */
  ratio: number;
}

export function diffWords(before: string, after: string): WordDiff {
  const a = tokenise(before);
  const b = tokenise(after);

  if (a.length === 0 && b.length === 0) {
    return { before: [], after: [], ratio: 0 };
  }

  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return {
      before: a.length > 0 ? [{ text: a.join(''), change: 'remove' }] : [],
      after: b.length > 0 ? [{ text: b.join(''), change: 'add' }] : [],
      ratio: 1,
    };
  }

  // Rolling two-row table: the full matrix is never needed, only the
  // backtrack, which is recovered by walking forward again below.
  const lcs = lcsTable(a, b);

  const beforeTokens: DiffToken[] = [];
  const afterTokens: DiffToken[] = [];
  let changed = 0;
  let i = 0;
  let j = 0;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push(beforeTokens, a[i]!, 'same');
      push(afterTokens, b[j]!, 'same');
      i += 1;
      j += 1;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push(beforeTokens, a[i]!, 'remove');
      changed += 1;
      i += 1;
    } else {
      push(afterTokens, b[j]!, 'add');
      changed += 1;
      j += 1;
    }
  }
  for (; i < a.length; i += 1) {
    push(beforeTokens, a[i]!, 'remove');
    changed += 1;
  }
  for (; j < b.length; j += 1) {
    push(afterTokens, b[j]!, 'add');
    changed += 1;
  }

  return {
    before: beforeTokens,
    after: afterTokens,
    ratio: changed / Math.max(1, Math.max(a.length, b.length)),
  };
}

/** `lcs[i][j]` — length of the longest common subsequence of the suffixes. */
function lcsTable(a: string[], b: string[]): number[][] {
  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i]![j] =
        a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
    }
  }
  return table;
}

/** Merges runs of the same change so the renderer gets spans, not words. */
function push(into: DiffToken[], text: string, change: DiffToken['change']) {
  const last = into[into.length - 1];
  if (last && last.change === change) last.text += text;
  else into.push({ text, change });
}
