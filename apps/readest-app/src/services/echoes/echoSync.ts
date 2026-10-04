import type { BookNote } from '@/types/book';
import { parseEchoNoteRef } from './createEchoStub';
import type { EchoStore } from './echoStore';
import type { EchoTrail } from './types';

/**
 * Echoes are stored twice by design:
 * - Canonical trail body in `Books/_echoes/echoes.json` (Library → Echoes)
 * - Lightweight `BookNote` stub (`type: 'echo'`, `note: echo:<trailId>`) in the
 *   seed book's config so the reader sidebar can list them
 *
 * Deletes must touch both. These helpers keep that cascade in one place.
 */

/** Find a live (non-tombstoned) stub that points at `trailId`. */
export function findLiveEchoStub(
  booknotes: BookNote[] | undefined,
  trailId: string,
  noteId?: string,
): BookNote | undefined {
  return (booknotes ?? []).find((n) => {
    if (n.deletedAt) return false;
    if (n.type !== 'echo' && !parseEchoNoteRef(n.note ?? '')) return false;
    if (noteId && n.id === noteId) return true;
    return parseEchoNoteRef(n.note ?? '') === trailId;
  });
}

/** Tombstone every stub that references `trailId` (or matches `noteId`). */
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
 * Drop promoted trails whose seed-book stub is missing or tombstoned.
 * Returns the trails that remain (still have a live stub, or no booknotes
 * available to check — caller passes `undefined` booknotes to skip a trail).
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
    return !!findLiveEchoStub(notes, trail.id, trail.noteId);
  });
}

/** Trails that should be deleted because their stub is gone. */
export function orphanedPromotedTrails(
  trails: EchoTrail[],
  booknotesByHash: Map<string, BookNote[] | undefined>,
): EchoTrail[] {
  return trails.filter((trail) => {
    if (trail.status !== 'promoted') return false;
    const notes = booknotesByHash.get(trail.seed.bookHash);
    if (notes === undefined) return false;
    return !findLiveEchoStub(notes, trail.id, trail.noteId);
  });
}
