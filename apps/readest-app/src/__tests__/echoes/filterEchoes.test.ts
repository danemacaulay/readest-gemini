import { describe, it, expect } from 'vitest';
import {
  ECHOES_RECENT_MS,
  echoTrailTitle,
  filterPromotedEchoes,
  matchesEchoSearch,
  seedBookLabel,
} from '@/services/echoes/filterEchoes';
import type { EchoTrail } from '@/services/echoes/types';

function trail(overrides: Partial<EchoTrail> & { id: string }): EchoTrail {
  return {
    status: 'promoted',
    seed: {
      bookHash: 'book-a',
      bookTitle: 'Ethics',
      seedText: 'Virtue is excellence.',
    },
    synthesis: 'Virtue as habit across authors.',
    sources: [{ id: 's1', title: 'Ethics I', snippet: 'excellence…', bookTitle: 'Ethics' }],
    createdAt: 1_000,
    updatedAt: 2_000,
    ...overrides,
  };
}

describe('echoTrailTitle', () => {
  it('prefers question, then seed text, then synthesis', () => {
    expect(
      echoTrailTitle(
        trail({
          id: '1',
          seed: { bookHash: 'h', question: 'What is virtue?', seedText: 'seed' },
        }),
      ),
    ).toBe('What is virtue?');

    expect(
      echoTrailTitle(
        trail({
          id: '2',
          seed: { bookHash: 'h', seedText: 'Seed only' },
          synthesis: 'synth',
        }),
      ),
    ).toBe('Seed only');

    expect(
      echoTrailTitle(
        trail({
          id: '3',
          seed: { bookHash: 'h' },
          synthesis: 'Only synthesis',
        }),
      ),
    ).toBe('Only synthesis');
  });
});

describe('matchesEchoSearch', () => {
  const sample = trail({
    id: '1',
    synthesis: 'Comparative take on courage',
    seed: { bookHash: 'h', seedText: 'seed thought', bookTitle: 'Iliad' },
    sources: [{ id: 's1', title: 'Book of Heroes', snippet: 'x', bookTitle: 'Iliad' }],
  });

  it('matches synthesis, seed text, and source titles', () => {
    expect(matchesEchoSearch(sample, 'courage')).toBe(true);
    expect(matchesEchoSearch(sample, 'seed thought')).toBe(true);
    expect(matchesEchoSearch(sample, 'heroes')).toBe(true);
    expect(matchesEchoSearch(sample, 'missing')).toBe(false);
  });

  it('treats empty query as match-all', () => {
    expect(matchesEchoSearch(sample, '  ')).toBe(true);
  });
});

describe('filterPromotedEchoes', () => {
  const now = 1_000_000;
  const promotedRecent = trail({ id: 'r', updatedAt: now - 1000, status: 'promoted' });
  const promotedOld = trail({
    id: 'o',
    updatedAt: now - ECHOES_RECENT_MS - 1,
    status: 'promoted',
    seed: { bookHash: 'book-z', bookTitle: 'Zen', seedText: 'old' },
  });
  const draft = trail({ id: 'd', status: 'draft', updatedAt: now });

  it('keeps only promoted trails for All', () => {
    const result = filterPromotedEchoes([promotedRecent, promotedOld, draft], {
      filter: 'all',
      now,
    });
    expect(result.map((t) => t.id)).toEqual(['r', 'o']);
  });

  it('Recent drops trails outside the window', () => {
    const result = filterPromotedEchoes([promotedRecent, promotedOld], {
      filter: 'recent',
      now,
    });
    expect(result.map((t) => t.id)).toEqual(['r']);
  });

  it('By seed book sorts by book title', () => {
    const a = trail({
      id: 'a',
      seed: { bookHash: '1', bookTitle: 'Alpha', seedText: 'a' },
      updatedAt: now,
    });
    const z = trail({
      id: 'z',
      seed: { bookHash: '2', bookTitle: 'Zulu', seedText: 'z' },
      updatedAt: now - 10,
    });
    const result = filterPromotedEchoes([z, a], { filter: 'by-seed-book', now });
    expect(result.map((t) => t.id)).toEqual(['a', 'z']);
    expect(seedBookLabel(result[0]!)).toBe('Alpha');
  });

  it('applies search across the filtered set', () => {
    const hit = trail({
      id: 'hit',
      synthesis: 'unique-token-xyz',
      updatedAt: now,
    });
    const miss = trail({ id: 'miss', synthesis: 'other', updatedAt: now - 1 });
    const result = filterPromotedEchoes([hit, miss], { query: 'unique-token', filter: 'all' });
    expect(result.map((t) => t.id)).toEqual(['hit']);
  });
});
