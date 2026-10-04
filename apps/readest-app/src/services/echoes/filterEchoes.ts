import type { EchoTrail } from './types';

export type EchoesListFilter = 'all' | 'recent' | 'by-seed-book';

/** Trails updated within this window count as "Recent". */
export const ECHOES_RECENT_MS = 30 * 24 * 60 * 60 * 1000;

const TITLE_MAX = 80;

/** Display title: question → seed text → synthesis snippet. */
export function echoTrailTitle(trail: EchoTrail): string {
  const question = trail.seed.question?.trim();
  if (question) return truncate(question, TITLE_MAX);

  const seedText = trail.seed.seedText?.trim();
  if (seedText) return truncate(seedText, TITLE_MAX);

  const synthesis = trail.synthesis?.trim();
  if (synthesis) return truncate(synthesis, TITLE_MAX);

  return 'Echo';
}

export function matchesEchoSearch(trail: EchoTrail, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const parts = [
    trail.synthesis,
    trail.seed.seedText,
    trail.seed.question,
    trail.seed.bookTitle,
    ...trail.sources.flatMap((s) => [s.title, s.bookTitle, s.snippet]),
  ];
  const haystack = parts.filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(q);
}

/**
 * Promoted trails only, optionally narrowed by recent window / seed-book sort
 * and free-text search across synthesis, seed text, and source titles.
 */
export function filterPromotedEchoes(
  trails: EchoTrail[],
  options: { query?: string; filter?: EchoesListFilter; now?: number } = {},
): EchoTrail[] {
  const { query = '', filter = 'all', now = Date.now() } = options;

  let list = trails.filter((t) => t.status === 'promoted');

  if (filter === 'recent') {
    list = list.filter((t) => now - t.updatedAt <= ECHOES_RECENT_MS);
  }

  list = list.filter((t) => matchesEchoSearch(t, query));

  if (filter === 'by-seed-book') {
    return [...list].sort((a, b) => {
      const bookCmp = seedBookLabel(a).localeCompare(seedBookLabel(b), undefined, {
        sensitivity: 'base',
      });
      if (bookCmp !== 0) return bookCmp;
      return b.updatedAt - a.updatedAt;
    });
  }

  return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function seedBookLabel(trail: EchoTrail): string {
  return trail.seed.bookTitle?.trim() || trail.seed.bookHash;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
