import { ECHOES_MIN_RETRIEVE_SCORE } from './constants';
import type { EchoRetrieveTrace, EchoRetrieveTraceEntry } from './types';

export type EchoRetrieveSourceInput = {
  id: string;
  title?: string;
  score?: number;
  bookTitle?: string;
};

function toEntry(source: EchoRetrieveSourceInput): EchoRetrieveTraceEntry {
  const entry: EchoRetrieveTraceEntry = { id: source.id };
  if (source.title !== undefined) entry.title = source.title;
  if (source.score !== undefined) entry.score = source.score;
  if (source.bookTitle !== undefined) entry.bookTitle = source.bookTitle;
  return entry;
}

/**
 * Split retrieve hits into kept vs below-threshold dropped.
 * Unscored sources stay in retrieved (do not invent scores).
 */
export function buildEchoesRetrieveTrace(
  query: string,
  sources: ReadonlyArray<EchoRetrieveSourceInput>,
  minScore: number = ECHOES_MIN_RETRIEVE_SCORE,
): EchoRetrieveTrace {
  const retrieved: EchoRetrieveTraceEntry[] = [];
  const dropped: EchoRetrieveTrace['dropped'] = [];

  for (const source of sources) {
    if (source.score !== undefined && source.score < minScore) {
      dropped.push({ ...toEntry(source), reason: 'below_threshold' });
    } else {
      retrieved.push(toEntry(source));
    }
  }

  return {
    query,
    retrieved,
    dropped,
    deferred: retrieved.length === 0,
    minScore,
  };
}

export function isEchoesRetrieveDeferred(trace: EchoRetrieveTrace): boolean {
  return trace.retrieved.length === 0;
}
