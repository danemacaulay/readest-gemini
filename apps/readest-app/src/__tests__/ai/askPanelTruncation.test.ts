import { describe, expect, it } from 'vitest';
import { formatTruncationNotice } from '../../components/ask/AskPanel';

describe('formatTruncationNotice', () => {
  const t = (s: string) => s;

  it('returns null when nothing was truncated', () => {
    expect(formatTruncationNotice({}, t)).toBeNull();
    expect(
      formatTruncationNotice({ truncatedSelection: false, truncatedLibrary: false }, t),
    ).toBeNull();
  });

  it('surfaces selection and library truncation', () => {
    expect(formatTruncationNotice({ truncatedSelection: true }, t)).toContain('Selection');
    expect(formatTruncationNotice({ truncatedLibrary: true }, t)).toContain('Library');
    const both = formatTruncationNotice({ truncatedSelection: true, truncatedLibrary: true }, t);
    expect(both).toContain('Selection');
    expect(both).toContain('Library');
  });
});
