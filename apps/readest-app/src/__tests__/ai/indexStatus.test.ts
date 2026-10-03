import { describe, expect, it } from 'vitest';
import { badgeState } from '@/services/ai/lightrag/indexStatus';

describe('badgeState', () => {
  it('prefers indexing over indexed', () => {
    expect(badgeState(1, new Set([1]), new Set([1]))).toBe('indexing');
  });
  it('returns indexed when present and not in flight', () => {
    expect(badgeState(1, new Set([1]), new Set())).toBe('indexed');
  });
  it('returns none otherwise', () => {
    expect(badgeState(2, new Set([1]), new Set())).toBe('none');
  });
});
