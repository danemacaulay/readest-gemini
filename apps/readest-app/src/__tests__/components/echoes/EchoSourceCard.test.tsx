import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  EchoSourceCard,
  formatEchoQuoteForDisplay,
  resolveSourceQuote,
} from '@/components/echoes/EchoSourceCard';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

afterEach(cleanup);

describe('formatEchoQuoteForDisplay', () => {
  it('unwraps hard line breaks into a flowing paragraph', () => {
    const raw = 'The obstacle\nis the way,\nand the way\nis forward.';
    expect(formatEchoQuoteForDisplay(raw)).toBe('The obstacle is the way, and the way is forward.');
  });

  it('keeps blank lines as paragraph breaks and joins soft hyphens', () => {
    const raw = 'A well-\nknown idea.\n\nNext\nparagraph.';
    expect(formatEchoQuoteForDisplay(raw)).toBe('A well-known idea.\n\nNext paragraph.');
  });
});

describe('resolveSourceQuote', () => {
  it('prefers full content over the short snippet alias', () => {
    const { preview, full } = resolveSourceQuote(
      { id: 's1', title: 'T', snippet: 'short…', content: 'A'.repeat(500) },
      [],
    );
    expect(full.length).toBe(500);
    expect(preview).toBe('short…');
  });

  it('falls back to matching passage content', () => {
    const { full } = resolveSourceQuote({ id: 's1', title: 'T', snippet: 'snip' }, [
      { id: 's1', content: 'full passage from retrieve' },
    ]);
    expect(full).toBe('full passage from retrieve');
  });
});

describe('EchoSourceCard', () => {
  it('clamps by default and expands to the full quote', () => {
    const full = 'The obstacle is the way. '.repeat(40);
    render(
      <ul>
        <EchoSourceCard
          source={{ id: 's1', title: 'Meditations', snippet: full.slice(0, 80), content: full }}
        />
      </ul>,
    );

    expect(screen.getByText(/The obstacle is the way/).className).toContain('line-clamp-3');
    fireEvent.click(screen.getByRole('button', { name: 'Show more' }));
    const expanded = screen.getByRole('button', { name: 'Show less' });
    expect(expanded.getAttribute('aria-expanded')).toBe('true');
    const quote = screen.getByText(/The obstacle is the way/);
    expect(quote.className).not.toContain('line-clamp-3');
    expect(quote.textContent?.length).toBeGreaterThan(400);
    fireEvent.click(expanded);
    expect(screen.getByRole('button', { name: 'Show more' })).toBeTruthy();
  });
});
