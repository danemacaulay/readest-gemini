import type { Book } from '@/types/book';
import { parseCalibreBookId } from '@/services/ai/lightrag/calibrePath';

/**
 * Resolve a LightRAG / Echo source `bookId` (Calibre numeric id as string or
 * number) to a library Book via reverse lookup on `filePath`.
 */
export function findLibraryBookByCalibreId(
  library: Book[],
  bookId: string | number | undefined | null,
): Book | undefined {
  if (bookId === undefined || bookId === null || bookId === '') return undefined;
  const target = String(bookId);
  return library.find((book) => {
    const parsed = parseCalibreBookId(book.filePath);
    return parsed != null && String(parsed) === target;
  });
}
