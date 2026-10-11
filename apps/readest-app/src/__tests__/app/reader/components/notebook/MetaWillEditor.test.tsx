import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MetaWillEditor from '@/app/reader/components/notebook/MetaWillEditor';
import { createEmptyMetaWill } from '@/utils/metaWill';
import type { BookNote } from '@/types/book';

const saveMetaWill = vi.fn();
const updateBooknotes = vi.fn();
const goTo = vi.fn();
let booknotes: BookNote[] = [];

vi.mock('@/app/reader/hooks/useSaveNotebookMetaWill', () => ({
  useSaveNotebookMetaWill: () => saveMetaWill,
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getConfig: () => ({ booknotes }),
    getBookData: () => ({ bookDoc: { toc: [] } }),
    updateBooknotes,
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getView: () => ({ goTo }),
  }),
}));

vi.mock('@/services/nav', () => ({
  findTocItemBS: (_toc: unknown[], cfi: string) =>
    cfi === 'epubcfi(/6/4)' ? { href: 'chapter-1', label: 'Chapter One' } : null,
}));

const makeBooknote = (overrides: Partial<BookNote>): BookNote => ({
  id: 'note-1',
  type: 'annotation',
  cfi: 'epubcfi(/6/4)',
  text: 'A useful highlighted passage',
  note: '',
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
});

describe('MetaWillEditor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    saveMetaWill.mockResolvedValue(true);
    booknotes = [
      makeBooknote({ id: 'note-1' }),
      makeBooknote({
        id: 'notebook',
        type: 'notebook',
        text: 'Private notebook body',
      }),
    ];
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('renders the five labelled text sections', () => {
    render(<MetaWillEditor bookKey='book-view' metaWill={createEmptyMetaWill()} />);

    expect(screen.getByRole('textbox', { name: 'Why I read it' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'What shifted' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'What I take' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'What I refuse' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Still open' })).toBeTruthy();
  });

  it('debounces saving updated section text', () => {
    render(<MetaWillEditor bookKey='book-view' metaWill={createEmptyMetaWill()} />);

    fireEvent.change(screen.getByRole('textbox', { name: 'Why I read it' }), {
      target: { value: 'To understand leadership' },
    });
    expect(saveMetaWill).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(500));

    expect(saveMetaWill).toHaveBeenCalledTimes(1);
    expect(saveMetaWill.mock.calls[0]?.[0].sections[0]).toEqual({
      id: 'why',
      text: 'To understand leadership',
      links: [],
    });
  });

  it('flushes a pending edit when unmounted before the debounce', () => {
    const { unmount } = render(
      <MetaWillEditor bookKey='book-view' metaWill={createEmptyMetaWill()} />,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Why I read it' }), {
      target: { value: 'Do not lose this draft' },
    });
    unmount();

    expect(saveMetaWill).toHaveBeenCalledTimes(1);
    expect(saveMetaWill.mock.calls[0]?.[0].sections[0].text).toBe('Do not lose this draft');
  });

  it('Link note appends a chip under the section and excludes the notebook record', () => {
    render(<MetaWillEditor bookKey='book-view' metaWill={createEmptyMetaWill()} />);

    const section = screen
      .getByRole('textbox', { name: 'What I take' })
      .closest('[data-meta-will-section]') as HTMLElement;
    const linkButton = within(section).getByRole('button', { name: 'Link note' });
    fireEvent.click(linkButton);

    expect(linkButton.closest('.dropdown')?.className).toContain('dropdown-open');
    expect(screen.getByRole('listbox', { name: 'Link note' })).toBeTruthy();
    expect(screen.queryByText('Private notebook body')).toBeNull();
    fireEvent.click(screen.getByRole('option', { name: 'A useful highlighted passage' }));

    expect(within(section).getByText('Chapter One')).toBeTruthy();
    expect(within(section).getByText('A useful highlighted passage')).toBeTruthy();
  });

  it('Link note shows an empty state when there are no annotations', () => {
    booknotes = [
      makeBooknote({
        id: 'notebook',
        type: 'notebook',
        text: 'Private notebook body',
      }),
    ];
    render(<MetaWillEditor bookKey='book-view' metaWill={createEmptyMetaWill()} />);

    const section = screen
      .getByRole('textbox', { name: 'What I take' })
      .closest('[data-meta-will-section]') as HTMLElement;
    fireEvent.click(within(section).getByRole('button', { name: 'Link note' }));

    expect(screen.getByText('No annotations to link')).toBeTruthy();
  });

  it('removing a chip does not delete the source annotation', () => {
    const metaWill = createEmptyMetaWill();
    metaWill.sections[2]!.links.push({
      booknoteId: 'note-1',
      chapterLabel: 'Chapter One',
      excerpt: 'A useful highlighted passage',
    });
    render(<MetaWillEditor bookKey='book-view' metaWill={metaWill} />);

    fireEvent.click(screen.getByRole('button', { name: 'Remove linked note' }));
    act(() => vi.advanceTimersByTime(500));

    expect(saveMetaWill.mock.calls[0]?.[0].sections[2].links).toEqual([]);
    expect(updateBooknotes).not.toHaveBeenCalled();
  });

  it('navigates to the source annotation from a chip', () => {
    const metaWill = createEmptyMetaWill();
    metaWill.sections[2]!.links.push({
      booknoteId: 'note-1',
      chapterLabel: 'Chapter One',
      excerpt: 'A useful highlighted passage',
    });
    render(<MetaWillEditor bookKey='book-view' metaWill={metaWill} />);

    fireEvent.click(screen.getByRole('button', { name: 'Go to linked note' }));

    expect(goTo).toHaveBeenCalledWith('epubcfi(/6/4)');
  });
});
