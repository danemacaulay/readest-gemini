/**
 * EchoesPanel: selection-only empty state, no Seed/composer/Save/Discard,
 * writes synthesis into the annotation note on success, removes empty
 * placeholder on failure when Find Echoes created it.
 */

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { BookNote } from '@/types/book';
import type { EchoTrail } from '@/services/echoes/types';

const h = vi.hoisted(() => ({
  saveBooknoteNoteText: vi.fn(async () => true),
  runEchoes: vi.fn(),
  saveConfig: vi.fn(async () => undefined),
  updateBooknotes: vi.fn((_key: string, booknotes: BookNote[]) => ({ booknotes })),
  booknotes: [] as BookNote[],
  storeGet: vi.fn(async (_id: string): Promise<EchoTrail | null> => null),
  storeList: vi.fn(async (): Promise<EchoTrail[]> => []),
  toast: vi.fn(),
  view: { addAnnotation: vi.fn() },
  getViewsById: vi.fn(() => [h.view]),
  removeBookNoteOverlays: vi.fn(),
}));

const translate = (value: string) => value;
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => translate,
}));

vi.mock('@/hooks/useAppRouter', () => ({
  useAppRouter: () => ({ push: vi.fn() }),
}));

const env = { envConfig: {}, appService: { fs: {} } };
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => env,
}));

vi.mock('@/app/reader/hooks/useSaveBooknoteNoteText', () => ({
  useSaveBooknoteNoteText: () => h.saveBooknoteNoteText,
}));

vi.mock('@/services/echoes/runEchoes', () => ({
  runEchoes: (...args: unknown[]) => h.runEchoes(...args),
  continueEchoInChat: vi.fn(async () => undefined),
}));

vi.mock('@/services/ai/ask/runCommand', () => ({
  tauriRunCommand: vi.fn(),
}));

vi.mock('@/services/ai/fileSystemFromAppService', () => ({
  fileSystemFromAppService: () => ({}),
}));

vi.mock('@/services/echoes/echoStore', () => ({
  getPersistentEchoStore: () => ({
    get: h.storeGet,
    list: h.storeList,
    upsert: vi.fn(),
    delete: vi.fn(),
    promote: vi.fn(),
  }),
}));

const settingsState = {
  settings: {
    aiSettings: { lightragBaseUrl: 'http://x', lightragMode: 'hybrid', agyPath: 'agy' },
  },
};

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: Object.assign(() => settingsState, {
    getState: () => settingsState,
  }),
}));

vi.mock('@/store/bookDataStore', () => {
  const state = {
    getBookData: () => ({ book: { title: 'Meditations', hash: 'bookhash' } }),
    getConfig: () => ({ booknotes: h.booknotes }),
    updateBooknotes: h.updateBooknotes,
    saveConfig: h.saveConfig,
  };
  return {
    useBookDataStore: (selector?: (value: typeof state) => unknown) =>
      selector ? selector(state) : state,
  };
});

vi.mock('@/store/libraryStore', () => ({
  useLibraryStore: () => ({ library: [] }),
}));

vi.mock('@/store/notebookStore', () => ({
  useNotebookStore: () => ({ setNotebookActiveTab: vi.fn() }),
}));

vi.mock('@/store/aiChatStore', () => ({
  useAIChatStore: () => ({
    createConversation: vi.fn(),
    addMessage: vi.fn(),
    setAgyConversationId: vi.fn(),
  }),
}));

vi.mock('@/store/readerStore', () => {
  const state = {
    bookKeys: [] as string[],
    getViewsById: h.getViewsById,
  };
  return {
    useReaderStore: Object.assign(
      (selector?: (value: typeof state) => unknown) => (selector ? selector(state) : state),
      {
        getState: () => state,
      },
    ),
  };
});

vi.mock('@/app/reader/utils/annotatorUtil', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/app/reader/utils/annotatorUtil')>();
  return {
    ...actual,
    removeBookNoteOverlays: (...args: unknown[]) => h.removeBookNoteOverlays(...args),
  };
});

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: Object.assign(() => ({}), {
    getState: () => ({ setSideBarBookKey: vi.fn() }),
  }),
}));

vi.mock('@/utils/event', () => ({
  eventDispatcher: {
    dispatch: (...args: unknown[]) => h.toast(...args),
  },
}));

vi.mock('@/utils/nav', () => ({
  focusExistingReaderWindow: vi.fn(async () => null),
  navigateToReader: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  emitTo: vi.fn(),
}));

vi.mock('@/components/echoes/EchoConnectionList', () => ({
  EchoConnectionList: () => <div data-testid='echo-connections' />,
}));

vi.mock('@/components/echoes/EchoIdeaChips', () => ({
  EchoIdeaChips: () => <div data-testid='echo-ideas' />,
}));

vi.mock('@/components/echoes/EchoSourceCard', () => ({
  EchoSourceCard: () => <li data-testid='echo-source' />,
}));

import EchoesPanel from '@/app/reader/components/notebook/EchoesPanel';
import { useEchoesUiStore } from '@/store/echoesUiStore';

const BOOK_KEY = 'bookhash-view1';

function makeTrail(overrides: Partial<EchoTrail> = {}): EchoTrail {
  return {
    id: 'trail-1',
    status: 'promoted',
    seed: {
      bookHash: 'bookhash',
      seedText: 'The impediment to action advances action.',
      bookTitle: 'Meditations',
      annotationId: 'anno-1',
    },
    synthesis: 'Comparative synthesis text.',
    sources: [],
    createdAt: 1,
    updatedAt: 1,
    noteId: 'anno-1',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.booknotes = [];
  h.storeGet.mockResolvedValue(null);
  h.storeList.mockResolvedValue([]);
  h.runEchoes.mockReset();
  h.saveBooknoteNoteText.mockResolvedValue(true);
  h.updateBooknotes.mockImplementation((_key: string, booknotes: BookNote[]) => {
    h.booknotes = booknotes;
    return { booknotes };
  });
  useEchoesUiStore.setState({
    activeEchoId: null,
    pendingSeed: null,
    isRunning: false,
    error: null,
    runToken: 0,
  });
});

afterEach(cleanup);

describe('EchoesPanel', () => {
  test('empty state is selection-only with no composer', () => {
    render(<EchoesPanel bookKey={BOOK_KEY} />);

    expect(screen.getByText('Select a passage and choose Find Echoes.')).toBeTruthy();
    expect(screen.queryByPlaceholderText('Ask across your library…')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Find' })).toBeNull();
  });

  test('trail view keeps comparative take and continue; omits Seed/Save/Discard', async () => {
    const trail = makeTrail({
      ideas: [{ id: 'i1', name: 'Assent', type: 'concept' }],
      connections: [{ id: 'c1', from: 'A', to: 'B' }],
      sources: [
        {
          id: 's1',
          title: 'Enchiridion',
          snippet: '…',
          bookId: '42',
          bookTitle: 'Epictetus',
        },
      ],
    });
    h.storeGet.mockResolvedValue(trail);

    act(() => {
      useEchoesUiStore.getState().setActiveEchoId(trail.id);
    });

    render(<EchoesPanel bookKey={BOOK_KEY} />);

    await waitFor(() => {
      expect(screen.getByText('Comparative synthesis text.')).toBeTruthy();
    });
    expect(screen.getByText('Comparative take')).toBeTruthy();
    expect(screen.getByText('Ideas')).toBeTruthy();
    expect(screen.getByText('Connections')).toBeTruthy();
    expect(screen.getByText('Sources')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue in chat' })).toBeTruthy();

    expect(screen.queryByText('Seed')).toBeNull();
    expect(screen.queryByText('Draft')).toBeNull();
    expect(screen.queryByText('Saved trail')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save trail' })).toBeNull();
    expect(screen.queryByPlaceholderText('Ask across your library…')).toBeNull();
  });

  test('on successful runEchoes, writes synthesis into the annotation note', async () => {
    const trail = makeTrail({
      synthesis: 'Written into the note.',
      noteId: 'anno-new',
    });
    h.runEchoes.mockResolvedValue(trail);

    render(<EchoesPanel bookKey={BOOK_KEY} />);

    await act(async () => {
      useEchoesUiStore.getState().requestEchoesRun({
        bookHash: 'bookhash',
        bookTitle: 'Meditations',
        seedText: 'passage',
        annotationId: 'anno-new',
        annotationIsNew: true,
      });
    });

    await waitFor(() => {
      expect(h.saveBooknoteNoteText).toHaveBeenCalledWith('anno-new', 'Written into the note.', {
        contribution: 'ai',
      });
    });
    expect(h.runEchoes).toHaveBeenCalled();
  });

  test('on failure with annotationIsNew, removes empty annotation placeholder', async () => {
    h.booknotes = [
      {
        id: 'anno-new',
        type: 'annotation',
        cfi: 'epubcfi(/6/2)',
        text: 'passage',
        style: 'highlight',
        color: 'yellow',
        note: '',
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    h.runEchoes.mockRejectedValue(new Error('retrieve failed'));

    render(<EchoesPanel bookKey={BOOK_KEY} />);

    await act(async () => {
      useEchoesUiStore.getState().requestEchoesRun({
        bookHash: 'bookhash',
        bookTitle: 'Meditations',
        seedText: 'passage',
        annotationId: 'anno-new',
        annotationIsNew: true,
      });
    });

    await waitFor(() => {
      expect(h.updateBooknotes).toHaveBeenCalled();
    });
    const updated = h.booknotes.find((n) => n.id === 'anno-new');
    expect(updated?.deletedAt).toBeTruthy();
    expect(h.getViewsById).toHaveBeenCalledWith('bookhash');
    expect(h.removeBookNoteOverlays).toHaveBeenCalledWith(
      h.view,
      expect.objectContaining({ id: 'anno-new', note: '' }),
    );
    expect(h.removeBookNoteOverlays.mock.calls[0]?.[1]).not.toHaveProperty('deletedAt');
    expect(h.saveBooknoteNoteText).not.toHaveBeenCalled();
  });

  test('on EchoesDeferredError, info-toasts and removes new placeholder without error banner', async () => {
    const { EchoesDeferredError } = await import('@/services/echoes/EchoesDeferredError');
    h.booknotes = [
      {
        id: 'anno-new',
        type: 'annotation',
        cfi: 'epubcfi(/6/2)',
        text: 'passage',
        style: 'highlight',
        color: 'yellow',
        note: '',
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    h.runEchoes.mockRejectedValue(
      new EchoesDeferredError({
        query: 'passage',
        retrieved: [],
        dropped: [{ id: 'x', score: 0.1, reason: 'below_threshold' }],
        deferred: true,
        minScore: 0.3,
      }),
    );

    render(<EchoesPanel bookKey={BOOK_KEY} />);

    await act(async () => {
      useEchoesUiStore.getState().requestEchoesRun({
        bookHash: 'bookhash',
        bookTitle: 'Meditations',
        seedText: 'passage',
        annotationId: 'anno-new',
        annotationIsNew: true,
      });
    });

    await waitFor(() => {
      expect(h.toast).toHaveBeenCalledWith(
        'toast',
        expect.objectContaining({
          type: 'info',
          message: 'Nothing in your library points this direction',
        }),
      );
    });
    expect(useEchoesUiStore.getState().error).toBeNull();
    expect(h.updateBooknotes).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  test('shows Trace when trail.trace is present and hides it when absent', async () => {
    const withTrace = makeTrail({
      trace: {
        query: 'Where else?',
        retrieved: [{ id: 's1', title: 'Enchiridion', score: 0.8 }],
        dropped: [],
        deferred: false,
        minScore: 0.3,
      },
      sources: [{ id: 's1', title: 'Enchiridion', snippet: '…' }],
    });
    h.storeGet.mockResolvedValue(withTrace);
    act(() => {
      useEchoesUiStore.getState().setActiveEchoId(withTrace.id);
    });
    const { unmount } = render(<EchoesPanel bookKey={BOOK_KEY} />);
    await waitFor(() => {
      expect(screen.getByText('Trace')).toBeTruthy();
    });
    expect(screen.getByText(/Where else\?/)).toBeTruthy();
    unmount();

    const withoutTrace = makeTrail({ id: 'trail-2' });
    h.storeGet.mockResolvedValue(withoutTrace);
    act(() => {
      useEchoesUiStore.getState().setActiveEchoId(withoutTrace.id);
    });
    render(<EchoesPanel bookKey={BOOK_KEY} />);
    await waitFor(() => {
      expect(screen.getByText('Comparative synthesis text.')).toBeTruthy();
    });
    expect(screen.queryByText('Trace')).toBeNull();
  });

  test('on failure, clears pendingSeed so remount does not re-fire runEchoes', async () => {
    h.runEchoes.mockRejectedValue(new Error('retrieve failed'));

    const { unmount } = render(<EchoesPanel bookKey={BOOK_KEY} />);

    await act(async () => {
      useEchoesUiStore.getState().requestEchoesRun({
        bookHash: 'bookhash',
        bookTitle: 'Meditations',
        seedText: 'passage',
        annotationId: 'anno-new',
        annotationIsNew: false,
      });
    });

    await waitFor(() => {
      expect(h.runEchoes).toHaveBeenCalledTimes(1);
      expect(useEchoesUiStore.getState().pendingSeed).toBeNull();
      expect(useEchoesUiStore.getState().error).toBe('retrieve failed');
    });

    const runTokenAfterFail = useEchoesUiStore.getState().runToken;
    unmount();

    render(<EchoesPanel bookKey={BOOK_KEY} />);

    // Store still has the same runToken; pendingSeed must stay cleared so the
    // effect does not treat this as a new run request.
    expect(useEchoesUiStore.getState().runToken).toBe(runTokenAfterFail);
    expect(useEchoesUiStore.getState().pendingSeed).toBeNull();

    await act(async () => {
      await Promise.resolve();
    });
    expect(h.runEchoes).toHaveBeenCalledTimes(1);
  });
});
