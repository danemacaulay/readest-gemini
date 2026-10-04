import { describe, it, expect } from 'vitest';
import { formatBookMetadataPack } from '@/services/ai/adapters/bookContext';

describe('formatBookMetadataPack', () => {
  it('includes core fields', () => {
    const text = formatBookMetadataPack({
      title: 'Dune',
      author: 'Herbert',
      tags: ['sf'],
      series: 'Dune',
      seriesIndex: 1,
      publisher: 'Chilton',
      published: '1965',
      subjects: ['Fiction'],
      description: 'Desert planet.',
    });
    expect(text).toContain('Title: Dune');
    expect(text).toContain('Author: Herbert');
    expect(text).toContain('Tags: sf');
    expect(text).toContain('Series: Dune (#1)');
    expect(text).toContain('Desert planet');
  });

  it('respects maxChars', () => {
    const text = formatBookMetadataPack(
      { title: 'T', author: 'A', description: 'x'.repeat(5000) },
      200,
    );
    expect(text.length).toBeLessThanOrEqual(200);
  });
});
