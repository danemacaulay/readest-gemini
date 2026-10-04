import { describe, expect, it } from 'vitest';
import { findLatestTrailForBook, planOpenEchoBook } from '@/services/echoes/openEchoBook';
import type { EchoTrail } from '@/services/echoes/types';

function trail(
  overrides: Partial<EchoTrail> & {
    id: string;
    status: EchoTrail['status'];
    seed: EchoTrail['seed'];
    updatedAt: number;
  },
): EchoTrail {
  return {
    synthesis: '',
    sources: [],
    createdAt: overrides.updatedAt,
    ...overrides,
  };
}

describe('planOpenEchoBook', () => {
  it('navigates when no reader is mounted', () => {
    expect(planOpenEchoBook({ bookHash: 'bookA', bookKeys: [], readerMounted: false })).toEqual({
      action: 'navigate',
      bookHash: 'bookA',
    });
  });

  it('focuses an already-open book instead of navigating', () => {
    expect(
      planOpenEchoBook({
        bookHash: 'bookA',
        bookKeys: ['bookA-xyz', 'bookB-1'],
        readerMounted: true,
      }),
    ).toEqual({ action: 'focus-existing', bookKey: 'bookA-xyz' });
  });

  it('switches in-place when the reader is mounted but the book is not open', () => {
    expect(
      planOpenEchoBook({
        bookHash: 'bookC',
        bookKeys: ['bookA-xyz'],
        readerMounted: true,
      }),
    ).toEqual({ action: 'switch-in-reader', bookHash: 'bookC' });
  });
});

describe('findLatestTrailForBook', () => {
  const trails = [
    trail({
      id: 'draft-old',
      status: 'draft',
      seed: { bookHash: 'bookA' },
      updatedAt: 100,
    }),
    trail({
      id: 'promoted-newer',
      status: 'promoted',
      seed: { bookHash: 'bookA' },
      updatedAt: 300,
    }),
    trail({
      id: 'promoted-older',
      status: 'promoted',
      seed: { bookHash: 'bookA' },
      updatedAt: 200,
    }),
    trail({
      id: 'other-book',
      status: 'promoted',
      seed: { bookHash: 'bookB' },
      updatedAt: 999,
    }),
  ];

  it('returns the newest promoted trail for the book', () => {
    expect(findLatestTrailForBook(trails, 'bookA')?.id).toBe('promoted-newer');
  });

  it('falls back to newest draft when no promoted trail exists', () => {
    expect(
      findLatestTrailForBook(
        [
          trail({ id: 'd1', status: 'draft', seed: { bookHash: 'bookA' }, updatedAt: 1 }),
          trail({ id: 'd2', status: 'draft', seed: { bookHash: 'bookA' }, updatedAt: 5 }),
        ],
        'bookA',
      )?.id,
    ).toBe('d2');
  });

  it('returns undefined when the book has no trails', () => {
    expect(findLatestTrailForBook(trails, 'missing')).toBeUndefined();
  });
});
