import { afterEach, describe, expect, it } from 'vitest';
import {
  clearReaderWindowBooks,
  getReaderWindowLabelForBook,
  publishReaderWindowBooks,
} from '@/services/echoes/readerWindowRegistry';

afterEach(() => {
  clearReaderWindowBooks('reader-0');
  clearReaderWindowBooks('reader-1');
});

describe('readerWindowRegistry', () => {
  it('publishes and looks up book → window label', () => {
    publishReaderWindowBooks('reader-0', ['hashA', 'hashB']);
    expect(getReaderWindowLabelForBook('hashA')).toBe('reader-0');
    expect(getReaderWindowLabelForBook('hashB')).toBe('reader-0');
  });

  it('moves a book to a newer publisher and clears closed windows', () => {
    publishReaderWindowBooks('reader-0', ['hashA']);
    publishReaderWindowBooks('reader-1', ['hashA']);
    expect(getReaderWindowLabelForBook('hashA')).toBe('reader-1');
    clearReaderWindowBooks('reader-1');
    expect(getReaderWindowLabelForBook('hashA')).toBeUndefined();
  });

  it('replaces the full set for a window on republish', () => {
    publishReaderWindowBooks('reader-0', ['hashA', 'hashB']);
    publishReaderWindowBooks('reader-0', ['hashC']);
    expect(getReaderWindowLabelForBook('hashA')).toBeUndefined();
    expect(getReaderWindowLabelForBook('hashC')).toBe('reader-0');
  });
});
