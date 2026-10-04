import type { BookNote } from '@/types/book';
import { parseEchoNoteRef } from './createEchoStub';
import type { EchoStore } from './echoStore';
import type { EchoTrail } from './types';

/**
 * Echoes are stored twice by design:
 * - Canonical trail body in `Books/_echoes/echoes.json` (Library → Echoes)
 * - Book-side pointer: either a native annotation (`trail.noteId` /
 *   `seed.annotationId`) or a legacy `type: 'echo'` stub (`note: echo:<trailId>`)
 *
 * Deletes must touch both. These helpers keep that cascade in one place.
 */

/** Book-side pointer id for a trail (native annotation or legacy stub id). */
export function trailPointerNoteId(trail: EchoTrail): string | undefined {
  return trail.noteId ?? trail.seed.annotationId;
}

/** Find a live (non-tombstoned) book-side pointer for `trailId`. */
export function findLiveEchoStub(
  booknotes: BookNote[] | undefined,
  trailId: string,
  noteId?: string,
): BookNote | undefined {
  return (booknotes ?? []).find((n) => {
    if (n.deletedAt) return false;
    // New trails: native annotation BookNote id matches trail.noteId.
    if (noteId && n.id === noteId) return true;
    // Legacy: type:'echo' stub or echo:<trailId> ref in note body.
    if (n.type !== 'echo' && !parseEchoNoteRef(n.note ?? '')) return false;
    return parseEchoNoteRef(n.note ?? '') === trailId;
  });
}

/** Tombstone every stub/annotation that references `trailId` (or matches `noteId`). */
export function tombstoneEchoStubs(
  booknotes: BookNote[],
  trailId: string,
  noteId: string | undefined,
  stamp: number,
): BookNote[] {
  return booknotes.map((n) => {
    const ref = parseEchoNoteRef(n.note ?? '');
    const isTarget =
      (!n.deletedAt && ref === trailId) || (!!noteId && n.id === noteId && !n.deletedAt);
    if (!isTarget) return n;
    return { ...n, deletedAt: stamp, updatedAt: stamp };
  });
}

/** Delete the canonical trail. No-op if already gone. */
export async function deleteEchoTrail(store: EchoStore, trailId: string): Promise<void> {
  const existing = await store.get(trailId);
  if (!existing) return;
  await store.delete(trailId);
}

/**
 * Drop promoted trails whose book-side pointer is missing or tombstoned.
 * Returns the trails that remain (still have a live annotation/stub, or no
 * booknotes available to check — caller passes `undefined` booknotes to skip).
 */
export function filterTrailsWithLiveStubs(
  trails: EchoTrail[],
  booknotesByHash: Map<string, BookNote[] | undefined>,
): EchoTrail[] {
  return trails.filter((trail) => {
    if (trail.status !== 'promoted') return true;
    const notes = booknotesByHash.get(trail.seed.bookHash);
    // Book config not loaded — keep the trail; don't invent orphans.
    if (notes === undefined) return true;
    return !!findLiveEchoStub(notes, trail.id, trailPointerNoteId(trail));
  });
}

/** Trails that should be deleted because their book-side pointer is gone. */
export function orphanedPromotedTrails(
  trails: EchoTrail[],
  booknotesByHash: Map<string, BookNote[] | undefined>,
): EchoTrail[] {
  return trails.filter((trail) => {
    if (trail.status !== 'promoted') return false;
    const notes = booknotesByHash.get(trail.seed.bookHash);
    if (notes === undefined) return false;
    return !findLiveEchoStub(notes, trail.id, trailPointerNoteId(trail));
  });
}
