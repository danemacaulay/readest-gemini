import type { BookNote, BookNoteContribution } from '@/types/book';

export type { BookNoteContribution };

/**
 * Resolve the contribution field for a note-text update.
 * Explicit options win; otherwise an `ai` note becomes `co-authored` on human edit.
 */
export function resolveContributionUpdate(
  existing: Pick<BookNote, 'contribution'>,
  options?: { contribution?: BookNoteContribution },
): BookNoteContribution | undefined {
  if (options?.contribution !== undefined) return options.contribution;
  if (existing.contribution === 'ai') return 'co-authored';
  return existing.contribution;
}
