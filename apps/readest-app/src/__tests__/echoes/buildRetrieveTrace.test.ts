import { describe, expect, it } from 'vitest';
import {
  buildEchoesRetrieveTrace,
  isEchoesRetrieveDeferred,
} from '@/services/echoes/buildRetrieveTrace';
import { ECHOES_MIN_RETRIEVE_SCORE } from '@/services/echoes/constants';

describe('buildEchoesRetrieveTrace', () => {
  it('keeps sources without a score in retrieved', () => {
    const trace = buildEchoesRetrieveTrace('q', [{ id: 'a', title: 'A' }]);
    expect(trace.retrieved).toEqual([{ id: 'a', title: 'A' }]);
    expect(trace.dropped).toEqual([]);
    expect(trace.deferred).toBe(false);
  });

  it('drops sources below the min score', () => {
    const trace = buildEchoesRetrieveTrace('q', [{ id: 'b', title: 'B', score: 0.1 }]);
    expect(trace.retrieved).toEqual([]);
    expect(trace.dropped).toEqual([{ id: 'b', title: 'B', score: 0.1, reason: 'below_threshold' }]);
    expect(trace.deferred).toBe(true);
  });

  it('keeps sources at or above the min score', () => {
    const trace = buildEchoesRetrieveTrace('q', [
      { id: 'c', score: ECHOES_MIN_RETRIEVE_SCORE },
      { id: 'd', score: 0.9, bookTitle: 'Book' },
    ]);
    expect(trace.retrieved.map((e) => e.id)).toEqual(['c', 'd']);
    expect(trace.dropped).toEqual([]);
    expect(trace.deferred).toBe(false);
  });

  it('defers when every scored source is below threshold', () => {
    const trace = buildEchoesRetrieveTrace('obstacle', [
      { id: 'x', score: 0.05 },
      { id: 'y', score: 0.2 },
    ]);
    expect(isEchoesRetrieveDeferred(trace)).toBe(true);
    expect(trace.deferred).toBe(true);
    expect(trace.query).toBe('obstacle');
    expect(trace.minScore).toBe(ECHOES_MIN_RETRIEVE_SCORE);
  });

  it('defers on empty input', () => {
    const trace = buildEchoesRetrieveTrace('q', []);
    expect(trace.deferred).toBe(true);
    expect(isEchoesRetrieveDeferred(trace)).toBe(true);
  });

  it('records the minScore used on the trace', () => {
    const trace = buildEchoesRetrieveTrace('q', [], 0.55);
    expect(trace.minScore).toBe(0.55);
  });
});
