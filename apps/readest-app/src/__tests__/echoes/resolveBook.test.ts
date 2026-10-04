import { describe, it, expect } from 'vitest';
import { findLibraryBookByCalibreId } from '@/services/echoes/resolveBook';
import type { Book } from '@/types/book';

function book(partial: Partial<Book> & { hash: string; filePath?: string }): Book {
  return {
    format: 'EPUB',
    title: 'T',
    author: 'A',
    createdAt: 1,
    updatedAt: 1,
    ...partial,
  } as Book;
}

describe('findLibraryBookByCalibreId', () => {
  const library = [
    book({
      hash: 'h1',
      filePath: '/Calibre Library/Author/Title (42)/book.epub',
    }),
    book({
      hash: 'h2',
      filePath: '/tmp/Books/h2/book.epub',
    }),
  ];

  it('resolves Calibre bookId from filePath', () => {
    expect(findLibraryBookByCalibreId(library, '42')?.hash).toBe('h1');
    expect(findLibraryBookByCalibreId(library, 42)?.hash).toBe('h1');
  });

  it('returns undefined when missing or non-calibre', () => {
    expect(findLibraryBookByCalibreId(library, '99')).toBeUndefined();
    expect(findLibraryBookByCalibreId(library, undefined)).toBeUndefined();
    expect(findLibraryBookByCalibreId(library, '')).toBeUndefined();
  });
});
