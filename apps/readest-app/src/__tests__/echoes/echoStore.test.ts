import { describe, it, expect } from 'vitest';
import {
  createMemoryEchoStore,
  createPersistentEchoStore,
  ECHOES_BASE,
  ECHOES_DIR,
  ECHOES_FILE,
} from '@/services/echoes/echoStore';
import {
  createEchoBookNoteStub,
  echoNoteRef,
  parseEchoNoteRef,
} from '@/services/echoes/createEchoStub';
import type { EchoTrail } from '@/services/echoes/types';
import type { BaseDir, FileSystem } from '@/types/system';

function createMemoryFs(): FileSystem {
  const files = new Map<string, string>();
  const key = (path: string, base: BaseDir) => `${base}:${path}`;
  return {
    resolvePath: () => ({ path: '', base: 'None' as BaseDir }),
    getURL: () => '',
    getBlobURL: async () => '',
    readFile: async (path: string, base: BaseDir) => {
      const value = files.get(key(path, base));
      if (value === undefined) throw new Error(`ENOENT: ${path}`);
      return value;
    },
    writeFile: async (path: string, base: BaseDir, content: string | ArrayBuffer | File) => {
      files.set(key(path, base), typeof content === 'string' ? content : String(content));
    },
    removeFile: async (path: string, base: BaseDir) => {
      files.delete(key(path, base));
    },
    readDir: async () => [],
    createDir: async () => undefined,
    removeDir: async () => undefined,
    exists: async (path: string, base: BaseDir) => files.has(key(path, base)),
    stats: async () => ({ size: 0, isDirectory: false, isFile: true }),
  } as unknown as FileSystem;
}

function draftInput(overrides: Partial<EchoTrail> = {}) {
  return {
    seed: {
      bookHash: 'book-hash-1',
      cfi: 'epubcfi(/6/4!/4/2/1:0)',
      seedText: 'Virtue is excellence of character.',
      question: 'What is virtue?',
      bookTitle: 'Nicomachean Ethics',
    },
    synthesis: 'Virtue is a habit of excellence.',
    sources: [
      {
        id: 's1',
        title: 'Ethics I',
        snippet: 'Excellence of character…',
        bookId: 'book-hash-1',
        bookTitle: 'Nicomachean Ethics',
      },
    ],
    ...overrides,
  };
}

describe('createEchoBookNoteStub', () => {
  it('builds an echo BookNote with echo:<id> note ref', () => {
    const trail: EchoTrail = {
      id: 'echo-abc',
      status: 'promoted',
      seed: {
        bookHash: 'h1',
        cfi: 'epubcfi(/6/2)',
        seedText: 'seed text',
      },
      synthesis: 'synth',
      sources: [],
      createdAt: 100,
      updatedAt: 200,
      noteId: 'note-1',
    };

    const note = createEchoBookNoteStub(trail);
    expect(note).toMatchObject({
      id: 'note-1',
      type: 'echo',
      bookHash: 'h1',
      cfi: 'epubcfi(/6/2)',
      text: 'seed text',
      note: 'echo:echo-abc',
      createdAt: 100,
    });
    expect(parseEchoNoteRef(note.note)).toBe('echo-abc');
    expect(echoNoteRef('echo-abc')).toBe('echo:echo-abc');
  });

  it('defaults missing cfi to empty string', () => {
    const trail: EchoTrail = {
      id: 'e2',
      status: 'draft',
      seed: { bookHash: 'h2' },
      synthesis: '',
      sources: [],
      createdAt: 1,
      updatedAt: 1,
    };
    expect(createEchoBookNoteStub(trail).cfi).toBe('');
  });
});

describe('echoStore', () => {
  it('upserts a draft and lists it', async () => {
    const store = createMemoryEchoStore();
    const trail = await store.upsert(draftInput());
    expect(trail.status).toBe('draft');
    expect(trail.id).toBeTruthy();
    expect(trail.seed.bookHash).toBe('book-hash-1');
    expect(trail.sources[0]?.bookTitle).toBe('Nicomachean Ethics');

    const listed = await store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe(trail.id);
    expect(await store.get(trail.id)).toEqual(trail);
  });

  it('promotes draft → stub BookNote and persists noteId', async () => {
    const store = createMemoryEchoStore();
    const draft = await store.upsert(draftInput());
    expect(draft.status).toBe('draft');
    expect(draft.noteId).toBeUndefined();

    const { trail, note } = await store.promote(draft.id);
    expect(trail.status).toBe('promoted');
    expect(trail.noteId).toBeTruthy();
    expect(note.type).toBe('echo');
    expect(note.id).toBe(trail.noteId);
    expect(note.cfi).toBe(draft.seed.cfi);
    expect(note.text).toBe(draft.seed.seedText);
    expect(note.note).toBe(`echo:${draft.id}`);
    expect(note.bookHash).toBe(draft.seed.bookHash);

    const again = await store.get(draft.id);
    expect(again?.status).toBe('promoted');
    expect(again?.noteId).toBe(note.id);
  });

  it('updates via upsert and deletes', async () => {
    const store = createMemoryEchoStore();
    const draft = await store.upsert(draftInput());
    const updated = await store.upsert({
      id: draft.id,
      seed: draft.seed,
      synthesis: 'Revised synthesis',
      sources: draft.sources,
    });
    expect(updated.synthesis).toBe('Revised synthesis');
    expect(updated.updatedAt).toBeGreaterThanOrEqual(draft.updatedAt);

    await store.delete(draft.id);
    expect(await store.get(draft.id)).toBeUndefined();
    expect(await store.list()).toHaveLength(0);
  });

  it('persists to Books/_echoes/echoes.json via injected fs', async () => {
    const fs = createMemoryFs();
    const store = createPersistentEchoStore(fs);
    const trail = await store.upsert(draftInput());
    await store.promote(trail.id);

    expect(await fs.exists(ECHOES_FILE, ECHOES_BASE)).toBe(true);
    const raw = (await fs.readFile(ECHOES_FILE, ECHOES_BASE, 'text')) as string;
    const parsed = JSON.parse(raw) as { trails: EchoTrail[] };
    expect(parsed.trails).toHaveLength(1);
    expect(parsed.trails[0]?.status).toBe('promoted');
    expect(parsed.trails[0]?.noteId).toBeTruthy();

    const reloaded = createPersistentEchoStore(fs);
    const listed = await reloaded.list();
    expect(listed[0]?.id).toBe(trail.id);
    expect(listed[0]?.status).toBe('promoted');
    expect(ECHOES_DIR).toBe('_echoes');
  });

  it('throws when promoting a missing trail', async () => {
    const store = createMemoryEchoStore();
    await expect(store.promote('missing')).rejects.toThrow(/not found/);
  });
});
