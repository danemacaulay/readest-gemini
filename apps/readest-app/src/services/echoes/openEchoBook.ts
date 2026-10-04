import type { EchoTrail } from './types';

/**
 * Decide how to open a book from an Echo surface (source Open, library list).
 * Same-window reader: focus / switch in place. Otherwise navigate fresh.
 */
export type OpenEchoBookPlan =
  | { action: 'focus-existing'; bookKey: string }
  | { action: 'switch-in-reader'; bookHash: string }
  | { action: 'navigate'; bookHash: string };

export function planOpenEchoBook(options: {
  bookHash: string;
  bookKeys: string[];
  readerMounted: boolean;
}): OpenEchoBookPlan {
  const { bookHash, bookKeys, readerMounted } = options;
  if (!readerMounted) {
    return { action: 'navigate', bookHash };
  }

  const existing = bookKeys.find((key) => key.split('-')[0] === bookHash);
  if (existing) {
    return { action: 'focus-existing', bookKey: existing };
  }
  return { action: 'switch-in-reader', bookHash };
}

/** Most recent trail for a seed book. Prefer promoted when any exist. */
export function findLatestTrailForBook(
  trails: EchoTrail[],
  bookHash: string,
): EchoTrail | undefined {
  const forBook = trails.filter((t) => t.seed.bookHash === bookHash);
  if (forBook.length === 0) return undefined;
  const promoted = forBook.filter((t) => t.status === 'promoted');
  const pool = promoted.length > 0 ? promoted : forBook;
  return [...pool].sort((a, b) => b.updatedAt - a.updatedAt)[0];
}
