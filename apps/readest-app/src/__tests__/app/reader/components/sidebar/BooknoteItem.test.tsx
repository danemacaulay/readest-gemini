import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import BooknoteItem from '@/app/reader/components/sidebar/BooknoteItem';
import { BooknoteTimeProvider } from '@/app/reader/components/sidebar/BooknoteTime';
import { BookNote } from '@/types/book';
import { useMetaWillUiStore } from '@/store/metaWillUiStore';
import { createEmptyMetaWill } from '@/utils/metaWill';
import { eventDispatcher } from '@/utils/event';
import { NOTE_PREFIX } from '@/types/view';

// vi.mock factories are hoisted above const initializers, so shared spies MUST
// come from vi.hoisted() — plain top-level consts throw "cannot access before
// initialization" when a factory references them.
const mocks = vi.hoisted(() => {
  const state = { booknotes: [] as BookNote[] };
  return {
    state,
    trails: [] as { id: string; noteId?: string; seed?: { annotationId?: string } }[],
    appService: { isMobile: false, isIOSApp: false },
    isNotebookVisible: false,
    setNotebookVisible: vi.fn(),
    setNotebookActiveTab: vi.fn(),
    openEchoesSidebar: vi.fn(),
    setNotebookEditAnnotation: vi.fn(),
    setActiveEchoId: vi.fn(),
    toast: vi.fn(),
    addAnnotation: vi.fn(),
    saveConfig: vi.fn(),
    saveMetaWill: vi.fn(async () => true),
    deleteEchoTrail: vi.fn(async (_store: unknown, _trailId: string) => undefined),
    // Mirrors the real store: `updateBooknotes` writes back whatever array
    // it's called with (production code now returns a new array from
    // `updateBooknoteNoteText` instead of mutating the existing one).
    updateBooknotes: vi.fn((_key: string, booknotes: typeof state.booknotes) => {
      state.booknotes = booknotes;
      return { booknotes: state.booknotes };
    }),
  };
});

vi.mock('@/store/notebookStore', () => ({
  useNotebookStore: () => ({
    isNotebookVisible: mocks.isNotebookVisible,
    setNotebookVisible: mocks.setNotebookVisible,
    setNotebookActiveTab: mocks.setNotebookActiveTab,
    setNotebookEditAnnotation: mocks.setNotebookEditAnnotation,
  }),
}));

vi.mock('@/app/reader/hooks/useSaveNotebookMetaWill', () => ({
  useSaveNotebookMetaWill: () => mocks.saveMetaWill,
}));

vi.mock('@/app/reader/utils/openEchoesSidebar', () => ({
  openEchoesSidebar: (...args: unknown[]) => mocks.openEchoesSidebar(...args),
}));

vi.mock('@/services/nav', () => ({
  findTocItemBS: () => ({ href: 'ch1.html', label: 'Chapter 1' }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: mocks.appService }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({
    settings: { globalReadSettings: { customHighlightColors: {} } },
  }),
}));

vi.mock('@/store/readerStore', () => ({
  useReaderStore: () => ({
    getProgress: () => undefined,
    getView: () => null,
    getViewsById: () => [{ addAnnotation: mocks.addAnnotation }],
    getViewSettings: () => undefined,
  }),
}));

vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getBookData: () => ({ bookDoc: { toc: [] } }),
    getConfig: () => ({ booknotes: mocks.state.booknotes }),
    saveConfig: mocks.saveConfig,
    updateBooknotes: mocks.updateBooknotes,
  }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (size: number) => size,
}));

vi.mock('@/services/echoes/echoStore', () => ({
  getPersistentEchoStore: () => ({
    delete: mocks.deleteEchoTrail,
    get: async () => ({ id: 'trail-1' }),
    list: async () => mocks.trails,
  }),
}));

vi.mock('@/services/echoes/echoSync', async () => {
  const actual = await vi.importActual<typeof import('@/services/echoes/echoSync')>(
    '@/services/echoes/echoSync',
  );
  return {
    ...actual,
    deleteEchoTrail: (store: unknown, trailId: string) => mocks.deleteEchoTrail(store, trailId),
  };
});

vi.mock('@/services/ai/fileSystemFromAppService', () => ({
  fileSystemFromAppService: () => ({}),
}));

vi.mock('@/store/echoesUiStore', () => ({
  useEchoesUiStore: Object.assign(() => ({}), {
    getState: () => ({
      activeEchoId: null,
      setActiveEchoId: mocks.setActiveEchoId,
    }),
  }),
}));

dayjs.extend(relativeTime);

const makeItem = (overrides: Partial<BookNote> = {}): BookNote => ({
  id: 'note-1',
  type: 'annotation',
  cfi: 'epubcfi(/6/4!/4/2,/1:0,/1:5)',
  text: 'highlighted words',
  style: 'highlight',
  color: 'yellow',
  note: '',
  createdAt: 1000,
  updatedAt: 1000,
  ...overrides,
});

const renderItem = (item: BookNote, inlineNoteEditing?: boolean, linkedTrailId?: string | null) =>
  render(
    <BooknoteTimeProvider>
      <ul>
        <BooknoteItem
          bookKey='hash1-primary'
          item={item}
          inlineNoteEditing={inlineNoteEditing}
          linkedTrailId={linkedTrailId}
        />
      </ul>
    </BooknoteTimeProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mocks.state.booknotes = [];
  mocks.trails = [];
  mocks.appService.isMobile = false;
  mocks.appService.isIOSApp = false;
  mocks.isNotebookVisible = false;
  useMetaWillUiStore.setState({ focusedSectionId: null, liveMetaWill: null });
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 768 });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BooknoteItem', () => {
  it('on desktop, clicking an annotation while a meta-will section is focused appends a link', () => {
    const annotation = makeItem();
    const notebook = makeItem({
      id: 'notebook',
      type: 'notebook',
      metaWill: createEmptyMetaWill(),
    });
    mocks.state.booknotes = [annotation, notebook];
    mocks.isNotebookVisible = true;
    useMetaWillUiStore.setState({ focusedSectionId: 'take' });
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch');
    renderItem(annotation);

    fireEvent.click(screen.getByText('highlighted words'));

    expect(mocks.saveMetaWill).toHaveBeenCalledWith(
      expect.objectContaining({
        sections: expect.arrayContaining([
          expect.objectContaining({
            id: 'take',
            links: [
              {
                booknoteId: 'note-1',
                excerpt: 'highlighted words',
                chapterLabel: 'Chapter 1',
              },
            ],
          }),
        ]),
      }),
    );
    expect(dispatch).not.toHaveBeenCalledWith('navigate', expect.anything());
  });

  it.each([
    ['native mobile app', true, 1024, 768],
    ['narrow viewport', false, 639, 768],
    ['short viewport', false, 1024, 639],
  ])('on mobile (%s), clicking an annotation never appends a meta-will link', (_case, isMobile, width, height) => {
    const annotation = makeItem();
    const notebook = makeItem({
      id: 'notebook',
      type: 'notebook',
      metaWill: createEmptyMetaWill(),
    });
    mocks.state.booknotes = [annotation, notebook];
    mocks.isNotebookVisible = true;
    mocks.appService.isMobile = isMobile;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
    useMetaWillUiStore.setState({ focusedSectionId: 'take' });
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch');
    renderItem(annotation);

    fireEvent.click(screen.getByText('highlighted words'));

    expect(mocks.saveMetaWill).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith('navigate', expect.anything());
  });

  it('with no focused meta-will section, clicking an annotation keeps navigate behavior', () => {
    const annotation = makeItem();
    const notebook = makeItem({
      id: 'notebook',
      type: 'notebook',
      metaWill: createEmptyMetaWill(),
    });
    mocks.state.booknotes = [annotation, notebook];
    mocks.isNotebookVisible = true;
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch');
    renderItem(annotation);

    fireEvent.click(screen.getByText('highlighted words'));

    expect(mocks.saveMetaWill).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith('navigate', expect.anything());
  });

  it('refreshes the relative time every minute without remounting the item', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T10:00:00Z'));
    renderItem(makeItem({ type: 'bookmark', createdAt: Date.now() }));

    expect(screen.getByText('a few seconds ago')).toBeTruthy();
    act(() => vi.advanceTimersByTime(59_999));
    expect(screen.getByText('a few seconds ago')).toBeTruthy();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText('a minute ago')).toBeTruthy();
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByText('2 minutes ago')).toBeTruthy();
  });

  it('shares one timer across items, cleans it up, and recalculates on reopening', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T10:00:00Z'));
    const item = makeItem({ type: 'bookmark', createdAt: Date.now() });
    const secondItem = makeItem({ id: 'note-2', createdAt: Date.now() });
    const { unmount } = render(
      <BooknoteTimeProvider>
        <ul>
          <BooknoteItem bookKey='hash1-primary' item={item} />
          <BooknoteItem bookKey='hash1-primary' item={secondItem} />
        </ul>
      </BooknoteTimeProvider>,
    );

    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getAllByText('a minute ago')).toHaveLength(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);

    act(() => vi.advanceTimersByTime(4 * 60_000));
    renderItem(item);
    expect(screen.getByText('5 minutes ago')).toBeTruthy();
    expect(vi.getTimerCount()).toBe(1);
  });

  it('never opens the notebook when a noted item is clicked', () => {
    renderItem(makeItem({ note: 'my note' }));
    fireEvent.click(screen.getByText('highlighted words'));
    expect(mocks.setNotebookVisible).not.toHaveBeenCalled();
  });

  it('opens an echo via onClick without dispatching navigate (same-book open-in-place)', () => {
    const onClick = vi.fn();
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch');
    render(
      <BooknoteTimeProvider>
        <ul>
          <BooknoteItem
            bookKey='hash1-primary'
            item={makeItem({
              type: 'echo',
              text: 'Virtue is excellence.',
              note: 'echo:trail-1',
              cfi: 'epubcfi(/6/4!/4/2/1:0)',
            })}
            onClick={onClick}
          />
        </ul>
      </BooknoteTimeProvider>,
    );

    fireEvent.click(screen.getByText('Virtue is excellence.'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalledWith('navigate', expect.anything());
  });

  it('cascades echo stub delete into the echo trail store', async () => {
    const echo = makeItem({
      type: 'echo',
      text: 'Virtue is excellence.',
      note: 'echo:trail-1',
      cfi: '',
    });
    mocks.state.booknotes = [echo];
    renderItem(echo);

    fireEvent.click(screen.getByLabelText('Delete'));
    expect(mocks.updateBooknotes).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(mocks.deleteEchoTrail).toHaveBeenCalledWith(expect.anything(), 'trail-1');
    });
  });

  it('opens left-sidebar Echoes for an annotation linked by trail.noteId', () => {
    const annotation = makeItem({
      id: 'anno-linked',
      type: 'annotation',
      text: 'seed quote',
      note: 'comparative take',
    });
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch');
    // Parent (BooknoteView) passes linkedTrailId from a shared index — no per-row list().
    renderItem(annotation, undefined, 'trail-linked');

    fireEvent.click(screen.getByText('seed quote'));
    expect(mocks.setActiveEchoId).toHaveBeenCalledWith('trail-linked');
    expect(mocks.openEchoesSidebar).toHaveBeenCalled();
    expect(mocks.setNotebookActiveTab).not.toHaveBeenCalledWith('echoes');
    expect(dispatch).not.toHaveBeenCalledWith('navigate', expect.anything());
  });

  it('cascades delete of an annotation-linked note into the echo trail store', () => {
    const annotation = makeItem({
      id: 'anno-linked',
      type: 'annotation',
      text: 'seed quote',
      note: 'comparative take',
    });
    mocks.state.booknotes = [annotation];
    renderItem(annotation, undefined, 'trail-linked');

    fireEvent.click(screen.getByLabelText('Delete'));
    expect(mocks.updateBooknotes).toHaveBeenCalled();
    expect(mocks.deleteEchoTrail).toHaveBeenCalledWith(expect.anything(), 'trail-linked');
  });

  it('falls back to async store.list on delete when linkedTrailId is not passed', async () => {
    const annotation = makeItem({
      id: 'anno-linked',
      type: 'annotation',
      text: 'seed quote',
      note: 'comparative take',
    });
    mocks.state.booknotes = [annotation];
    mocks.trails = [{ id: 'trail-linked', noteId: 'anno-linked' }];
    // Omit linkedTrailId so delete uses the async lookup fallback.
    renderItem(annotation);

    fireEvent.click(screen.getByLabelText('Delete'));
    expect(mocks.updateBooknotes).toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(mocks.deleteEchoTrail).toHaveBeenCalledWith(expect.anything(), 'trail-linked');
    });
  });

  it('shows Add Note on a bare highlight and saves a new note inline', async () => {
    const item = makeItem();
    mocks.state.booknotes = [item];
    renderItem(item, true);

    fireEvent.click(screen.getByRole('button', { name: 'Add Note' }));
    const editor = screen.getByRole('textbox');
    fireEvent.change(editor, { target: { value: 'fresh thought' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(mocks.updateBooknotes).toHaveBeenCalledTimes(1);
    const saved = mocks.state.booknotes[0] as BookNote;
    expect(saved.note).toBe('fresh thought');
    expect(saved.updatedAt).toBeGreaterThan(1000);
    expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
    expect(mocks.addAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ note: 'fresh thought', value: `${NOTE_PREFIX}${item.cfi}` }),
      false,
    );
  });

  it('whitespace-only draft saves an empty note', async () => {
    const item = makeItem();
    mocks.state.booknotes = [item];
    renderItem(item, true);

    fireEvent.click(screen.getByRole('button', { name: 'Add Note' }));
    const editor = screen.getByRole('textbox');
    fireEvent.change(editor, { target: { value: '   ' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect(mocks.updateBooknotes).toHaveBeenCalledTimes(1);
    const saved = mocks.state.booknotes[0] as BookNote;
    expect(saved.note).toBe('');
    expect(mocks.addAnnotation).not.toHaveBeenCalled();
  });

  it('clearing a note inline keeps the highlight and removes the bubble', async () => {
    const item = makeItem({ note: 'old note' });
    mocks.state.booknotes = [item];
    renderItem(item, true);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    const saved = mocks.state.booknotes[0] as BookNote;
    expect(saved.note).toBe('');
    expect(saved.deletedAt).toBeUndefined();
    expect(mocks.addAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ value: `${NOTE_PREFIX}${item.cfi}` }),
      true,
    );
  });

  it('aborts the inline save when the record is gone (deleted by sync)', async () => {
    const item = makeItem({ note: 'old note' });
    mocks.state.booknotes = [];
    renderItem(item, true);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'update' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });

    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('update');
    expect(mocks.updateBooknotes).not.toHaveBeenCalled();
    expect(mocks.saveConfig).not.toHaveBeenCalled();
  });

  it('routes Edit to the notebook editor without inlineNoteEditing', () => {
    const item = makeItem({ note: 'my note' });
    renderItem(item);

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(mocks.setNotebookEditAnnotation).toHaveBeenCalledWith(item);
    expect(mocks.setNotebookVisible).toHaveBeenCalledWith(true);
  });

  it('hides the edit affordance for bare highlights without inlineNoteEditing', () => {
    renderItem(makeItem());
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Add Note' })).toBeNull();
  });

  // iOS WebKit applies :hover at touchstart, so every scroll touch would
  // expand the card under the finger (#6568). Only a tap (focus) expands there.
  it('reveals the actions on hover except on iOS, where only focus does (#6568)', () => {
    const actionsClass = () =>
      screen.getByRole('button', { name: 'Delete' }).closest('.max-h-0')!.className;

    renderItem(makeItem());
    expect(actionsClass()).toContain('group-hover:max-h-8');
    expect(actionsClass()).toContain('group-focus-within:max-h-8');
    cleanup();

    mocks.appService.isIOSApp = true;
    renderItem(makeItem());
    expect(actionsClass()).not.toContain('group-hover');
    expect(actionsClass()).toContain('group-focus-within:max-h-8');
    expect(screen.getByRole('button', { name: 'Delete' }).className).not.toContain('group-hover');
  });

  it('long press on iOS focuses the card to reveal actions without navigating (#6568)', () => {
    vi.useFakeTimers();
    mocks.appService.isIOSApp = true;
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch');
    renderItem(makeItem());
    const card = screen.getByText('highlighted words').closest('li')!;

    fireEvent.pointerDown(card, { pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerUp(card, { pointerType: 'touch' });
    fireEvent.click(card);
    expect(document.activeElement).toBe(card);
    expect(dispatch).not.toHaveBeenCalledWith('navigate', expect.anything());

    // A plain tap afterwards still navigates.
    fireEvent.pointerDown(card, { pointerType: 'touch' });
    fireEvent.pointerUp(card, { pointerType: 'touch' });
    fireEvent.click(card);
    expect(dispatch).toHaveBeenCalledWith('navigate', expect.anything());
  });

  it('keyboard activation still navigates after a long press that was canceled (#6568)', () => {
    vi.useFakeTimers();
    mocks.appService.isIOSApp = true;
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch');
    renderItem(makeItem());
    const card = screen.getByText('highlighted words').closest('li')!;

    fireEvent.pointerDown(card, { pointerType: 'touch' });
    act(() => vi.advanceTimersByTime(300));
    fireEvent.pointerCancel(card, { pointerType: 'touch' });
    fireEvent.keyDown(card, { key: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith('navigate', expect.anything());
  });
});

it('keeps the inline draft through a failed save and closes only after retry succeeds (#6123)', async () => {
  const item = makeItem({ note: 'old note' });
  mocks.state.booknotes = [item];
  renderItem(item, true);
  fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'draft to keep' } });
  let rejectSave!: (error: Error) => void;
  mocks.saveConfig.mockReturnValueOnce(
    new Promise<void>((_resolve, reject) => {
      rejectSave = reject;
    }),
  );
  const toast = vi.spyOn(eventDispatcher, 'dispatch');
  fireEvent.click(screen.getByText('Save'));
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('draft to keep');
  fireEvent.click(screen.getByText('Save'));
  expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
  await act(async () => {
    rejectSave(new Error('disk full'));
  });
  expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('draft to keep');
  expect(toast).toHaveBeenCalledWith('toast', expect.objectContaining({ type: 'error' }));
  expect(mocks.state.booknotes[0]?.note).toBe('old note');
  expect(mocks.addAnnotation).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByText('Save'));
  });
  expect(screen.queryByRole('textbox')).toBeNull();
  toast.mockRestore();
});

describe('BooknoteItem contribution marker', () => {
  it('shows AI when contribution is ai', () => {
    renderItem(makeItem({ note: 'Ask answer', contribution: 'ai' }));
    expect(screen.getByText('AI')).toBeTruthy();
  });

  it('shows Co when contribution is co-authored', () => {
    renderItem(makeItem({ note: 'Edited answer', contribution: 'co-authored' }));
    expect(screen.getByText('Co')).toBeTruthy();
  });

  it('shows neither marker when contribution is unset', () => {
    renderItem(makeItem({ note: 'Handwritten note' }));
    expect(screen.queryByText('AI')).toBeNull();
    expect(screen.queryByText('Co')).toBeNull();
  });
});

describe('BooknoteItem ask registers', () => {
  const regs = [
    { kind: 'what' as const, text: 'Says X.' },
    { kind: 'how' as const, text: 'By Y.' },
    { kind: 'why' as const, text: 'Because Z.' },
    { kind: 'should' as const, text: 'Mostly right.' },
    { kind: 'argue' as const, text: 'Steelman, then tension.' },
  ];

  it('shows an empty-note placeholder above read-only registers after Ask', () => {
    renderItem(makeItem({ note: '', contribution: 'ai', askRegisters: [...regs] }));
    expect(screen.getByText('Add your thoughts…')).toBeTruthy();
    expect(screen.getByText('Ask · read only')).toBeTruthy();
    expect(screen.getByText('Says X.')).toBeTruthy();
    expect(screen.getByText('Argue')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Like' })).toHaveLength(5);
  });

  it('shows the human note above registers after the reader writes', () => {
    renderItem(
      makeItem({ note: 'my own words', contribution: 'co-authored', askRegisters: [...regs] }),
    );
    expect(screen.getByText('my own words')).toBeTruthy();
    expect(screen.getByText('Ask · read only')).toBeTruthy();
    expect(screen.queryByText('Add your thoughts…')).toBeNull();
  });

  it('persists a reaction without navigating', async () => {
    const item = makeItem({ note: '', contribution: 'ai', askRegisters: [...regs] });
    mocks.state.booknotes = [item];
    const dispatch = vi.spyOn(eventDispatcher, 'dispatch');
    renderItem(item);
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: 'Incorrect' })[3]!);
    });
    expect((mocks.state.booknotes[0] as BookNote).askRegisters![3]!.feedback?.verdict).toBe(
      'incorrect',
    );
    expect((mocks.state.booknotes[0] as BookNote).updatedAt).toBe(1000);
    expect(mocks.saveConfig).toHaveBeenCalledTimes(1);
    expect(dispatch).not.toHaveBeenCalledWith('navigate', expect.anything());
  });

  it('marks the active reaction with aria-pressed', () => {
    const withFeedback = [
      { ...regs[0]!, feedback: { rating: 'like' as const, updatedAt: 1 } },
      ...regs.slice(1),
    ];
    renderItem(makeItem({ note: '', contribution: 'ai', askRegisters: withFeedback }));
    expect(screen.getAllByRole('button', { name: 'Like' })[0]!.getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getAllByRole('button', { name: 'Like' })[1]!.getAttribute('aria-pressed')).toBe(
      'false',
    );
  });

  it('saves a proposal from the inline editor', async () => {
    const item = makeItem({ note: '', contribution: 'ai', askRegisters: [...regs] });
    mocks.state.booknotes = [item];
    const { unmount } = renderItem(item);
    fireEvent.click(screen.getAllByRole('button', { name: 'Propose' })[0]!);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'It says less than X.' } });
    await act(async () => {
      fireEvent.click(screen.getByText('Save'));
    });
    expect((mocks.state.booknotes[0] as BookNote).askRegisters![0]!.feedback?.proposal).toBe(
      'It says less than X.',
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    // Store update does not re-render the prop-driven fixture; remount from state.
    unmount();
    renderItem(mocks.state.booknotes[0] as BookNote);
    expect(screen.getByText(/It says less than X\./)).toBeTruthy();
  });
});
