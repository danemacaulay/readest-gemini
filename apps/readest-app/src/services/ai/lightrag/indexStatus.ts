export type LightRAGIndexBadge = 'none' | 'indexing' | 'indexed';

export function badgeState(
  bookId: number,
  indexed: Set<number>,
  inFlight: Set<number>,
): LightRAGIndexBadge {
  if (inFlight.has(bookId)) return 'indexing';
  if (indexed.has(bookId)) return 'indexed';
  return 'none';
}
