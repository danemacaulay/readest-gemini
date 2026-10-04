import { uniqueId } from '@/utils/misc';
import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';
import type { BookNote } from '@/types/book';
import type { FileSystem } from '@/types/system';
import { createEchoBookNoteStub } from './createEchoStub';
import type { EchoTrail, EchoesSnapshot } from './types';

/** Library-adjacent durable store (not IndexedDB chat). */
export const ECHOES_DIR = '_echoes';
export const ECHOES_FILE = `${ECHOES_DIR}/echoes.json`;
export const ECHOES_BASE = 'Books' as const;

export type EchoTrailInput = Omit<EchoTrail, 'id' | 'createdAt' | 'updatedAt' | 'status'> & {
  id?: string;
  status?: EchoTrail['status'];
  createdAt?: number;
  updatedAt?: number;
};

export type EchoStore = {
  load(): Promise<EchoesSnapshot>;
  save(snapshot: EchoesSnapshot): Promise<void>;
  list(): Promise<EchoTrail[]>;
  get(id: string): Promise<EchoTrail | undefined>;
  upsert(input: EchoTrailInput): Promise<EchoTrail>;
  delete(id: string): Promise<void>;
  promote(id: string): Promise<{ trail: EchoTrail; note: BookNote }>;
};

const emptySnapshot = (): EchoesSnapshot => ({ trails: [] });

function createStoreFromState(
  getState: () => EchoesSnapshot,
  setState: (next: EchoesSnapshot) => void | Promise<void>,
): EchoStore {
  let lastStamp = 0;
  const nextStamp = () => {
    const now = Date.now();
    lastStamp = now <= lastStamp ? lastStamp + 1 : now;
    return lastStamp;
  };

  return {
    async load() {
      return getState();
    },

    async save(snapshot) {
      await setState({
        trails: Array.isArray(snapshot.trails) ? [...snapshot.trails] : [],
      });
    },

    async list() {
      return [...getState().trails].sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async get(id) {
      return getState().trails.find((t) => t.id === id);
    },

    async upsert(input) {
      const state = getState();
      const now = nextStamp();
      const existing = input.id ? state.trails.find((t) => t.id === input.id) : undefined;

      if (existing) {
        const trail: EchoTrail = {
          ...existing,
          ...input,
          id: existing.id,
          seed: input.seed ?? existing.seed,
          sources: input.sources ?? existing.sources,
          status: input.status ?? existing.status,
          createdAt: existing.createdAt,
          updatedAt: now,
        };
        await setState({
          trails: state.trails.map((t) => (t.id === trail.id ? trail : t)),
        });
        return trail;
      }

      const trail: EchoTrail = {
        id: input.id ?? uniqueId(),
        status: input.status ?? 'draft',
        seed: input.seed,
        synthesis: input.synthesis ?? '',
        sources: input.sources ?? [],
        books: input.books,
        synthesisContext: input.synthesisContext,
        passages: input.passages,
        ideas: input.ideas,
        connections: input.connections,
        createdAt: input.createdAt ?? now,
        updatedAt: input.updatedAt ?? now,
        agyConversationId: input.agyConversationId,
        noteId: input.noteId,
      };
      await setState({ trails: [...state.trails, trail] });
      return trail;
    },

    async delete(id) {
      const state = getState();
      await setState({ trails: state.trails.filter((t) => t.id !== id) });
    },

    async promote(id) {
      const state = getState();
      const existing = state.trails.find((t) => t.id === id);
      if (!existing) {
        throw new Error(`EchoTrail not found: ${id}`);
      }

      const now = nextStamp();
      const noteId = existing.noteId ?? uniqueId();
      const trail: EchoTrail = {
        ...existing,
        status: 'promoted',
        noteId,
        updatedAt: now,
      };
      const note = createEchoBookNoteStub(trail);
      await setState({
        trails: state.trails.map((t) => (t.id === trail.id ? trail : t)),
      });
      return { trail, note };
    },
  };
}

/** In-memory EchoStore for unit tests. */
export function createMemoryEchoStore(initial?: EchoesSnapshot): EchoStore {
  let state: EchoesSnapshot = {
    trails: [...(initial?.trails ?? [])],
  };
  return createStoreFromState(
    () => state,
    (next) => {
      state = { trails: [...next.trails] };
    },
  );
}

let persistentSingleton: { fs: FileSystem; store: EchoStore } | null = null;

/** Process-wide persistent store keyed by the injected FileSystem instance. */
export function getPersistentEchoStore(fs: FileSystem): EchoStore {
  if (persistentSingleton?.fs === fs) return persistentSingleton.store;
  const store = createPersistentEchoStore(fs);
  persistentSingleton = { fs, store };
  return store;
}

/**
 * Durable EchoStore at `Books/_echoes/echoes.json` via Readest
 * `safeLoadJSON` / `safeSaveJSON`. Inject a FileSystem (from AppService.fs)
 * so tests can pass an in-memory adapter.
 */
export function createPersistentEchoStore(fs: FileSystem): EchoStore {
  let loaded = false;
  let state: EchoesSnapshot = emptySnapshot();
  let chain: Promise<void> = Promise.resolve();

  const readFromDisk = async () => {
    const data = await safeLoadJSON<EchoesSnapshot>(fs, ECHOES_FILE, ECHOES_BASE, emptySnapshot());
    state = {
      trails: Array.isArray(data.trails) ? data.trails : [],
    };
    loaded = true;
  };

  const ensureLoaded = async () => {
    if (loaded) return;
    await readFromDisk();
  };

  const persist = async (next: EchoesSnapshot) => {
    state = { trails: [...next.trails] };
    await fs.createDir(ECHOES_DIR, ECHOES_BASE, true);
    await safeSaveJSON(fs, ECHOES_FILE, ECHOES_BASE, state);
  };

  const withLoad = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(async () => {
      await ensureLoaded();
      return fn();
    });
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const inner = createStoreFromState(
    () => state,
    (next) => persist(next),
  );

  return {
    load: () => withLoad(() => inner.load()),
    save: (snapshot) => withLoad(() => inner.save(snapshot)),
    // Always re-read: library and reader are separate webviews with their own
    // singleton; a promote in the reader must appear the next time Library →
    // Echoes calls list().
    list: () =>
      withLoad(async () => {
        await readFromDisk();
        return inner.list();
      }),
    get: (id) => withLoad(() => inner.get(id)),
    upsert: (input) => withLoad(() => inner.upsert(input)),
    delete: (id) => withLoad(() => inner.delete(id)),
    promote: (id) => withLoad(() => inner.promote(id)),
  };
}
