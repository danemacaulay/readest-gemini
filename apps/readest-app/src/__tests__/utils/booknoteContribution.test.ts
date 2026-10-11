import { describe, expect, it } from 'vitest';
import { resolveContributionUpdate } from '@/utils/booknoteContribution';

describe('resolveContributionUpdate', () => {
  it('keeps an explicit ai write as ai', () => {
    expect(resolveContributionUpdate({ contribution: 'ai' }, { contribution: 'ai' })).toBe('ai');
  });

  it('flips ai to co-authored on a human edit (no options)', () => {
    expect(resolveContributionUpdate({ contribution: 'ai' }, undefined)).toBe('co-authored');
  });

  it('leaves co-authored unchanged on a human edit', () => {
    expect(resolveContributionUpdate({ contribution: 'co-authored' }, undefined)).toBe(
      'co-authored',
    );
  });

  it('leaves unset contribution unset on a human edit', () => {
    expect(resolveContributionUpdate({}, undefined)).toBeUndefined();
  });
});
