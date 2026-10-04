import { describe, expect, it } from 'vitest';
import {
  findLiveEchoStub,
  filterTrailsWithLiveStubs,
  orphanedPromotedTrails,
  tombstoneEchoStubs,
} from '@/services/echoes/echoSync';
import type { EchoTrail } from '@/services/echoes/types';
import type { BookNote } from '@/types/book';

function trail(overrides: Partial<EchoTrail> & { id: string }): EchoTrail {
  return {
    status: 'promoted',
    seed: { bookHash: 'bookA' },
    synthesis: '',
    sources: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function stub(overrides: Partial<BookNote> & { id: string }): BookNote {
  return {
    type: 'echo',
    cfi: '',
    text: 'seed',
    note: `echo:${overrides.id.replace('stub-', 'trail-')}`,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe('echoSync', () => {
  it('finds a live stub by trail ref or noteId', () => {
    const notes = [
      stub({ id: 'stub-1', note: 'echo:trail-1' }),
      stub({ id: 'stub-2', note: 'echo:trail-2', deletedAt: 99 }),
    ];
    expect(findLiveEchoStub(notes, 'trail-1')?.id).toBe('stub-1');
    expect(findLiveEchoStub(notes, 'trail-2')).toBeUndefined();
    expect(findLiveEchoStub(notes, 'missing', 'stub-1')?.id).toBe('stub-1');
  });

  it('tombstones matching stubs without mutating others', () => {
    const notes = [
      stub({ id: 'stub-1', note: 'echo:trail-1' }),
      stub({ id: 'stub-keep', note: 'echo:trail-keep' }),
    ];
    const next = tombstoneEchoStubs(notes, 'trail-1', 'stub-1', 500);
    expect(next[0]?.deletedAt).toBe(500);
    expect(next[1]?.deletedAt).toBeUndefined();
  });

  it('detects orphaned promoted trails when stub is gone', () => {
    const trails = [
      trail({ id: 'trail-live', noteId: 'stub-live' }),
      trail({ id: 'trail-orphan', noteId: 'stub-gone' }),
    ];
    const booknotesByHash = new Map([
      ['bookA', [stub({ id: 'stub-live', note: 'echo:trail-live' })]],
    ]);
    expect(orphanedPromotedTrails(trails, booknotesByHash).map((t) => t.id)).toEqual([
      'trail-orphan',
    ]);
    expect(filterTrailsWithLiveStubs(trails, booknotesByHash).map((t) => t.id)).toEqual([
      'trail-live',
    ]);
  });

  it('keeps promoted trails linked to a live native annotation by noteId', () => {
    const trails = [
      trail({ id: 'trail-anno', noteId: 'anno-1' }),
      trail({ id: 'trail-orphan', noteId: 'anno-missing' }),
    ];
    const annotation: BookNote = {
      id: 'anno-1',
      type: 'annotation',
      cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:5)',
      text: 'seed quote',
      note: 'synthesis body',
      createdAt: 1,
      updatedAt: 1,
    };
    const booknotesByHash = new Map([['bookA', [annotation]]]);
    expect(findLiveEchoStub([annotation], 'trail-anno', 'anno-1')?.id).toBe('anno-1');
    expect(orphanedPromotedTrails(trails, booknotesByHash).map((t) => t.id)).toEqual([
      'trail-orphan',
    ]);
    expect(filterTrailsWithLiveStubs(trails, booknotesByHash).map((t) => t.id)).toEqual([
      'trail-anno',
    ]);
  });

  it('treats a tombstoned annotation pointer as orphan even without a stub', () => {
    const trails = [trail({ id: 'trail-dead', noteId: 'anno-dead' })];
    const booknotesByHash = new Map<string, BookNote[] | undefined>([
      [
        'bookA',
        [
          {
            id: 'anno-dead',
            type: 'annotation',
            cfi: '',
            text: 'gone',
            note: '',
            createdAt: 1,
            updatedAt: 1,
            deletedAt: 99,
          },
        ],
      ],
    ]);
    expect(orphanedPromotedTrails(trails, booknotesByHash).map((t) => t.id)).toEqual([
      'trail-dead',
    ]);
  });

  it('keeps a trail when only a legacy echo stub remains (no annotation)', () => {
    const trails = [trail({ id: 'trail-legacy', noteId: 'anno-gone' })];
    const booknotesByHash = new Map([
      ['bookA', [stub({ id: 'stub-legacy', note: 'echo:trail-legacy' })]],
    ]);
    expect(orphanedPromotedTrails(trails, booknotesByHash)).toEqual([]);
    expect(filterTrailsWithLiveStubs(trails, booknotesByHash).map((t) => t.id)).toEqual([
      'trail-legacy',
    ]);
  });

  it('uses seed.annotationId when noteId is missing', () => {
    const trails = [
      trail({
        id: 'trail-seed-anno',
        seed: { bookHash: 'bookA', annotationId: 'anno-seed' },
      }),
    ];
    const annotation: BookNote = {
      id: 'anno-seed',
      type: 'annotation',
      cfi: '',
      text: 'seed',
      note: 'body',
      createdAt: 1,
      updatedAt: 1,
    };
    const booknotesByHash = new Map([['bookA', [annotation]]]);
    expect(orphanedPromotedTrails(trails, booknotesByHash)).toEqual([]);
  });

  it('keeps trails when booknotes were not loaded for that hash', () => {
    const trails = [trail({ id: 'trail-unknown' })];
    const booknotesByHash = new Map<string, BookNote[] | undefined>();
    expect(orphanedPromotedTrails(trails, booknotesByHash)).toEqual([]);
    expect(filterTrailsWithLiveStubs(trails, booknotesByHash)).toHaveLength(1);
  });
});
