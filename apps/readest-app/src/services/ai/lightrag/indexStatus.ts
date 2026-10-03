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

type BooksApiRow = {
  book_id?: number;
  status?: string;
};

export async function fetchIndexedBookIds(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Set<number>> {
  try {
    const normalized = baseUrl.replace(/\/+$/, '');
    const res = await fetchImpl(`${normalized}/api/books`);
    if (!res.ok) return new Set();
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return new Set();
    const ids = new Set<number>();
    for (const row of data as BooksApiRow[]) {
      if (typeof row?.book_id === 'number') {
        ids.add(row.book_id);
      }
    }
    return ids;
  } catch {
    return new Set();
  }
}

const indexedIds = new Set<number>();
const inFlightIds = new Set<number>();
const listeners = new Set<() => void>();

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function getIndexedIds(): Set<number> {
  return new Set(indexedIds);
}

export function getInFlightIds(): Set<number> {
  return new Set(inFlightIds);
}

export function setInFlight(id: number, active: boolean): void {
  if (active) {
    inFlightIds.add(id);
  } else {
    inFlightIds.delete(id);
  }
  notifyListeners();
}

export function markIndexed(id: number): void {
  indexedIds.add(id);
  inFlightIds.delete(id);
  notifyListeners();
}

export async function refreshIndexedIds(baseUrl: string): Promise<void> {
  const next = await fetchIndexedBookIds(baseUrl);
  indexedIds.clear();
  for (const id of next) {
    indexedIds.add(id);
  }
  notifyListeners();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function badgeForBookId(id: number): LightRAGIndexBadge {
  return badgeState(id, indexedIds, inFlightIds);
}
