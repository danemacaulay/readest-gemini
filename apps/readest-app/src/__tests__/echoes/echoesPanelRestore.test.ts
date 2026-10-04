import { describe, expect, it } from 'vitest';
import { findLatestTrailForBook } from '@/services/echoes/openEchoBook';
import { createMemoryEchoStore } from '@/services/echoes/echoStore';

/**
 * Mirrors EchoesPanel's mount restore: when activeEchoId is missing, pick the
 * latest trail for the current book from the durable store.
 */
async function restoreActiveEchoId(options: {
  bookHash: string;
  activeEchoId: string | null;
  store: ReturnType<typeof createMemoryEchoStore>;
}): Promise<string | null> {
  if (options.activeEchoId) return options.activeEchoId;
  const trails = await options.store.list();
  return findLatestTrailForBook(trails, options.bookHash)?.id ?? null;
}

describe('EchoesPanel restore-on-mount behavior', () => {
  it('rehydrates the newest promoted trail for the book when selection is empty', async () => {
    const store = createMemoryEchoStore();
    const older = await store.upsert({
      seed: { bookHash: 'bookA', seedText: 'older' },
      synthesis: 'older take',
      sources: [],
    });
    await store.promote(older.id);
    const newer = await store.upsert({
      seed: { bookHash: 'bookA', seedText: 'newer' },
      synthesis: 'newer take',
      sources: [],
    });
    const { trail: promotedNewer } = await store.promote(newer.id);
    await store.upsert({
      seed: { bookHash: 'bookB', seedText: 'other' },
      synthesis: 'other',
      sources: [],
      status: 'promoted',
    });

    const restored = await restoreActiveEchoId({
      bookHash: 'bookA',
      activeEchoId: null,
      store,
    });
    expect(restored).toBe(promotedNewer.id);
  });

  it('keeps an explicit activeEchoId instead of overriding it', async () => {
    const store = createMemoryEchoStore();
    const trail = await store.upsert({
      seed: { bookHash: 'bookA', seedText: 'x' },
      synthesis: 'y',
      sources: [],
      status: 'promoted',
    });

    const restored = await restoreActiveEchoId({
      bookHash: 'bookA',
      activeEchoId: 'explicit-id',
      store,
    });
    expect(restored).toBe('explicit-id');
    expect(trail.id).not.toBe('explicit-id');
  });
});
