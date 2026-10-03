import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunCommand, RunCommandResult } from '@/services/ai/ask/antigravityClient';
import {
  CalibreTagError,
  LightRAGIndexError,
  ensureRagIndexTag,
  parseCalibreTagsFromMetadata,
  runLightRAGIndexJob,
} from '@/services/ai/lightrag/indexJob';
import {
  getInFlightIds,
  getIndexedIds,
  refreshIndexedIds,
  setInFlight,
} from '@/services/ai/lightrag/indexStatus';
import { CALIBRE_RAG_SCOPE, CALIBREDB_SCOPE } from '@/services/ai/lightrag/shellScopes';

const LIBRARY = '/Users/me/My Drive/Books/calibre';
const FILE_PATH = '/Users/me/My Drive/Books/calibre/Author/Title (42)/Title - Author.epub';

function ok(stdout = ''): RunCommandResult {
  return { code: 0, stdout, stderr: '' };
}

describe('parseCalibreTagsFromMetadata', () => {
  it('parses Tags line into trimmed tags', () => {
    expect(
      parseCalibreTagsFromMetadata(
        'Title           : Foo\nTags            : Philosophy, History\n',
      ),
    ).toEqual(['Philosophy', 'History']);
  });

  it('returns empty when Tags missing', () => {
    expect(parseCalibreTagsFromMetadata('Title           : Foo\n')).toEqual([]);
  });
});

describe('runLightRAGIndexJob', () => {
  beforeEach(async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify([]), { status: 200 }));
    await refreshIndexedIds('http://127.0.0.1:8765');
    for (const id of getInFlightIds()) {
      setInFlight(id, false);
    }
  });

  it('throws when filePath has no Calibre book id', async () => {
    const runCommand = vi.fn<RunCommand>();
    await expect(
      runLightRAGIndexJob({
        filePath: '/tmp/Books/hash/book.epub',
        calibreLibraryPath: LIBRARY,
        calibredbPath: 'calibredb',
        calibreRagCmd: 'calibre-rag',
        runCommand,
      }),
    ).rejects.toThrow(LightRAGIndexError);
    expect(runCommand).not.toHaveBeenCalled();
  });

  it('tags then indexes on happy path and marks indexed', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify([{ book_id: 42, status: 'indexed' }]), { status: 200 }),
    );
    const calls: Array<{ cmd: string; args: string[]; timeoutMs: number }> = [];
    const runCommand: RunCommand = async (cmd, args, opts) => {
      calls.push({ cmd, args, timeoutMs: opts.timeoutMs });
      if (args.includes('show_metadata')) {
        return ok('Tags            : Philosophy\n');
      }
      return ok();
    };

    await runLightRAGIndexJob({
      filePath: FILE_PATH,
      calibreLibraryPath: LIBRARY,
      calibredbPath: '/Applications/calibre.app/Contents/MacOS/calibredb',
      calibreRagCmd: 'calibre-rag',
      lightragBaseUrl: 'http://127.0.0.1:8765',
      runCommand,
    });

    expect(calls).toHaveLength(3);
    expect(calls[0]).toMatchObject({
      cmd: CALIBREDB_SCOPE,
      args: [`--with-library=${LIBRARY}`, 'show_metadata', '42'],
    });
    expect(calls[1]).toMatchObject({
      cmd: CALIBREDB_SCOPE,
      args: [
        `--with-library=${LIBRARY}`,
        'set_metadata',
        '42',
        '--field',
        'tags:Philosophy, rag-index',
      ],
    });
    expect(calls[2]).toMatchObject({
      cmd: CALIBRE_RAG_SCOPE,
      args: ['index', '--id', '42'],
    });
    expect(calls[2]!.timeoutMs).toBeGreaterThanOrEqual(1_800_000);
    expect(getIndexedIds().has(42)).toBe(true);
    expect(getInFlightIds().has(42)).toBe(false);
  });

  it('keeps book indexed when refresh returns no indexed books yet', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify([]), { status: 200 }));
    const runCommand: RunCommand = async (_cmd, args) => {
      if (args.includes('show_metadata')) {
        return ok('Tags            : Philosophy\n');
      }
      return ok();
    };

    await runLightRAGIndexJob({
      filePath: FILE_PATH,
      calibreLibraryPath: LIBRARY,
      calibredbPath: 'calibredb',
      calibreRagCmd: 'calibre-rag',
      lightragBaseUrl: 'http://127.0.0.1:8765',
      runCommand,
    });

    expect(getIndexedIds().has(42)).toBe(true);
    expect(getInFlightIds().has(42)).toBe(false);
  });

  it('skips index when tagging fails', async () => {
    const runCommand: RunCommand = async (_cmd, args) => {
      if (args.includes('show_metadata')) {
        return { code: 1, stdout: '', stderr: 'calibredb failed' };
      }
      return ok();
    };

    await expect(
      runLightRAGIndexJob({
        filePath: FILE_PATH,
        calibreLibraryPath: LIBRARY,
        calibredbPath: 'calibredb',
        calibreRagCmd: 'calibre-rag',
        runCommand,
      }),
    ).rejects.toThrow(CalibreTagError);

    expect(getInFlightIds().has(42)).toBe(false);
    expect(getIndexedIds().has(42)).toBe(false);
  });

  it('throws LightRAGIndexError when index exits non-zero', async () => {
    const runCommand: RunCommand = async (_cmd, args) => {
      if (args.includes('show_metadata')) {
        return ok('Tags            : \n');
      }
      if (args[0] === 'index') {
        return { code: 2, stdout: '', stderr: 'index boom' };
      }
      return ok();
    };

    await expect(
      runLightRAGIndexJob({
        filePath: FILE_PATH,
        calibreLibraryPath: LIBRARY,
        calibredbPath: 'calibredb',
        calibreRagCmd: 'calibre-rag',
        runCommand,
      }),
    ).rejects.toThrow(LightRAGIndexError);

    expect(getInFlightIds().has(42)).toBe(false);
    expect(getIndexedIds().has(42)).toBe(false);
  });

  it('no-ops when the same book is already in flight', async () => {
    setInFlight(42, true);
    const runCommand = vi.fn<RunCommand>();

    await runLightRAGIndexJob({
      filePath: FILE_PATH,
      calibreLibraryPath: LIBRARY,
      calibredbPath: 'calibredb',
      calibreRagCmd: 'calibre-rag',
      runCommand,
    });

    expect(runCommand).not.toHaveBeenCalled();
    expect(getInFlightIds().has(42)).toBe(true);
  });
});

describe('ensureRagIndexTag', () => {
  it('merges rag-index via show_metadata + set_metadata', async () => {
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const runCommand: RunCommand = async (cmd, args) => {
      calls.push({ cmd, args });
      if (args.includes('show_metadata')) {
        return ok('Tags            : Sci-Fi\n');
      }
      return ok();
    };

    await ensureRagIndexTag({
      bookId: 7,
      calibreLibraryPath: LIBRARY,
      calibredbPath: 'calibredb',
      runCommand,
    });

    expect(calls[0]?.args).toEqual([`--with-library=${LIBRARY}`, 'show_metadata', '7']);
    expect(calls[1]?.args).toEqual([
      `--with-library=${LIBRARY}`,
      'set_metadata',
      '7',
      '--field',
      'tags:Sci-Fi, rag-index',
    ]);
  });
});
