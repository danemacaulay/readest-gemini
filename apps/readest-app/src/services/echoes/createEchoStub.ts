import { uniqueId } from '@/utils/misc';
import type { BookNote } from '@/types/book';
import type { EchoTrail } from './types';

/** Prefix stored in BookNote.note so callers can resolve the EchoTrail by id. */
export const ECHO_NOTE_REF_PREFIX = 'echo:';

export function echoNoteRef(echoId: string): string {
  return `${ECHO_NOTE_REF_PREFIX}${echoId}`;
}

export function parseEchoNoteRef(note: string): string | undefined {
  if (!note.startsWith(ECHO_NOTE_REF_PREFIX)) return undefined;
  const id = note.slice(ECHO_NOTE_REF_PREFIX.length).trim();
  return id || undefined;
}

/**
 * Build a BookNote stub for a promoted EchoTrail.
 *
 * Convention: `note` is `echo:<trailId>` (see {@link echoNoteRef}), not freeform
 * user text. The trail itself holds synthesis/sources; the stub is a lightweight
 * bookmark-style pointer in the book's notes list.
 */
export function createEchoBookNoteStub(trail: EchoTrail): BookNote {
  const now = Date.now();
  return {
    id: trail.noteId ?? uniqueId(),
    type: 'echo',
    bookHash: trail.seed.bookHash,
    cfi: trail.seed.cfi ?? '',
    text: trail.seed.seedText,
    note: echoNoteRef(trail.id),
    createdAt: trail.createdAt,
    updatedAt: now,
  };
}
