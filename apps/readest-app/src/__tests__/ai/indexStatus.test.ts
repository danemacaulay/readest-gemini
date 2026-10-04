import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/ai/utils/httpFetch', () => ({
  getAIFetch: () => globalThis.fetch.bind(globalThis),
}));

import {
  badgeForBookId,
  badgeState,
  fetchIndexedBookIds,
  getIndexedIds,
  getInFlightIds,
  markIndexed,
  refreshIndexedIds,
  setInFlight,
  subscribe,
} from '@/services/ai/lightrag/indexStatus';

describe('badgeState', () => {
  it('prefers indexing over indexed', () => {
    expect(badgeState(1, new Set([1]), new Set([1]))).toBe('indexing');
  });
  it('returns indexed when present and not in flight', () => {
    expect(badgeState(1, new Set([1]), new Set())).toBe('indexed');
  });
  it('returns none otherwise', () => {
    expect(badgeState(2, new Set([1]), new Set())).toBe('none');
  });
});

describe('fetchIndexedBookIds', () => {
  it('parses book ids from /api/books', async () => {
    const fetchImpl = async () =>
      new Response(
        JSON.stringify([
          { book_id: 10, status: 'indexed' },
          { book_id: 11, status: '' },
        ]),
        {
          status: 200,
        },
      );
    const ids = await fetchIndexedBookIds('http://127.0.0.1:8765', fetchImpl as typeof fetch);
    expect([...ids].sort()).toEqual([10, 11]);
  });

  it('returns empty set when unreachable', async () => {
    const fetchImpl = async () => {
      throw new Error('network');
    };
    await expect(
      fetchIndexedBookIds('http://127.0.0.1:8765', fetchImpl as typeof fetch),
    ).resolves.toEqual(new Set());
  });
});

describe('index status store', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify([]), { status: 200 }));
    await refreshIndexedIds('http://127.0.0.1:8765');
    setInFlight(3, false);
    setInFlight(5, false);
  });

  it('notifies subscribers on setInFlight and markIndexed', () => {
    let count = 0;
    const unsub = subscribe(() => {
      count += 1;
    });
    setInFlight(5, true);
    markIndexed(5);
    unsub();
    expect(count).toBe(2);
    expect(badgeForBookId(5)).toBe('indexed');
    expect(getInFlightIds().has(5)).toBe(false);
  });

  it('refreshIndexedIds replaces indexed set', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify([{ book_id: 3, status: 'indexed' }]), { status: 200 }),
    );
    await refreshIndexedIds('http://127.0.0.1:8765');
    expect([...getIndexedIds()]).toEqual([3]);
    expect(badgeForBookId(3)).toBe('indexed');
  });
});
