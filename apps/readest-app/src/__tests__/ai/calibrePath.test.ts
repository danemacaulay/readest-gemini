import { describe, expect, it } from 'vitest';
import { mergeRagIndexTags, parseCalibreBookId } from '@/services/ai/lightrag/calibrePath';

describe('parseCalibreBookId', () => {
  it('parses id from Calibre folder segment', () => {
    expect(
      parseCalibreBookId(
        '/Users/x/My Drive/Books/calibre/Jean Baudrillard/Simulacra and Simulation (958)/Simulacra and Simulation - Jean Baudrillard.epub',
      ),
    ).toBe(958);
  });

  it('returns null when no id segment', () => {
    expect(parseCalibreBookId('/tmp/Books/hash/book.epub')).toBeNull();
    expect(parseCalibreBookId(undefined)).toBeNull();
  });
});

describe('mergeRagIndexTags', () => {
  it('appends rag-index and dedupes', () => {
    expect(mergeRagIndexTags(['Philosophy', 'rag-index'])).toBe('Philosophy, rag-index');
    expect(mergeRagIndexTags(['History'])).toBe('History, rag-index');
    expect(mergeRagIndexTags([])).toBe('rag-index');
  });
});
