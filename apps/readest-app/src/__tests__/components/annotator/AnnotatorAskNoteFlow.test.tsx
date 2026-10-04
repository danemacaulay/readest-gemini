/**
 * Selection Ask opens AskComposer, then runs headless Ask → note via
 * runAskForNote. One in-flight Ask per Annotator; second submit is ignored.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { eventDispatcher } from '@/utils/event';
import { BookNote } from '@/types/book';

const h = vi.hoisted(() => ({
  actions: null as null | Record<string, () => boolean>,
  config: { booknotes: [] as BookNote[], viewSettings: {} },
  viewSettings: {
    annotationToolbarItems: ['ask'] as string[],
    noteExportConfig: {},
    copyToNotebook: false,
    rtl: false,
    vertical: false,
  },
  saveConfig: vi.fn(),
  updateBooknotes: vi.fn(),
  setConfig: vi.fn(),
  deselect: vi.fn(),
  suppressNativeSelectionHandles: vi.fn(),
  views: [] as { addAnnotation: ReturnType<typeof vi.fn> }[],
  isTextSelected: { current: true },
  runAskForNote: vi.fn(async (_req: unknown, _deps: unknown) => true),
  toast: vi.fn(),
}));

const settings = {
  globalReadSettings: {
    highlightStyle: 'highlight',
    highlightStyles: { highlight: 'yellow', underline: 'green', squiggly: 'blue' },
  },
  aiSettings: { agyPath: 'agy-from-settings' },
};

vi.mock('@/hooks/useShortcuts', () => ({
  default: (actions: Record<string, () => boolean>) => {
    h.actions = actions;
  },
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: {} }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (value: number) => value,
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: Object.assign(
    () => ({
      settings,
      setSettingsDialogBookKey: vi.fn(),
      setSettingsDialogOpen: vi.fn(),
      setActiveSettingsItemId: vi.fn(),
    }),
    { getState: () => ({ settings }) },
  ),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ isDarkMode: false }),
}));

vi.mock('@/store/bookDataStore', () => {
  const state = {
    getConfig: () => h.config,
    setConfig: h.setConfig,
    saveConfig: h.saveConfig,
    getBookData: () => ({
      book: { format: 'EPUB', primaryLanguage: 'en', title: 'Test Book', hash: 'book' },
      bookDoc: { metadata: { language: 'en' } },
      isFixedLayout: false,
    }),
    updateBooknotes: h.updateBooknotes,
  };
  return {
    useBookDataStore: (selector?: (value: typeof state) => unknown) =>
      selector ? selector(state) : state,
  };
});

vi.mock('@/store/readerStore', () => {
  const state = {
    getView: () => ({ deselect: h.deselect, getCFI: () => 'epubcfi(/6/2!/4/2)' }),
    getViewsById: () => h.views,
    getViewSettings: () => h.viewSettings,
  };
  return {
    useReaderStore: (selector?: (value: typeof state) => unknown) =>
      selector ? selector(state) : state,
  };
});

vi.mock('@/store/readerProgressStore', () => ({
  getBookProgress: () => ({ page: 1 }),
  useBookProgress: () => ({ page: 1, sectionHref: 'chapter.xhtml' }),
}));

vi.mock('@/store/notebookStore', () => ({
  useNotebookStore: () => ({
    setNotebookVisible: vi.fn(),
    setNotebookActiveTab: vi.fn(),
    setNotebookNewAnnotation: vi.fn(),
    setNotebookNewHighlightIds: vi.fn(),
  }),
}));

vi.mock('@/store/echoesUiStore', () => ({
  useEchoesUiStore: (selector?: (s: { requestEchoesRun: () => void }) => unknown) => {
    const state = { requestEchoesRun: vi.fn() };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/store/sidebarStore', () => ({
  useSidebarStore: () => ({
    clearBooknotesNav: vi.fn(),
    isSideBarVisible: false,
    setSideBarVisible: vi.fn(),
    setSearchBarVisible: vi.fn(),
  }),
}));

vi.mock('@/store/customDictionaryStore', () => ({
  useCustomDictionaryStore: Object.assign(
    () => ({ loadCustomDictionaries: vi.fn().mockResolvedValue(undefined) }),
    { getState: () => ({ settings: { providerEnabled: {} } }) },
  ),
}));

vi.mock('@/store/deviceStore', () => ({
  useDeviceControlStore: () => ({ listenToNativeTouchEvents: vi.fn() }),
}));

vi.mock('@/hooks/useFileSelector', () => ({
  useFileSelector: () => ({ selectFiles: vi.fn() }),
}));

vi.mock('@/app/reader/hooks/useNotesSync', () => ({ useNotesSync: () => {} }));
vi.mock('@/app/reader/hooks/useBookOrbitNotesSync', () => ({ useBookOrbitNotesSync: () => {} }));
vi.mock('@/app/reader/hooks/useReadwiseSync', () => ({ useReadwiseSync: () => {} }));
vi.mock('@/app/reader/hooks/useHardcoverSync', () => ({ useHardcoverSync: () => {} }));
vi.mock('@/app/reader/hooks/usePageboundSync', () => ({ usePageboundSync: () => {} }));
vi.mock('@/app/reader/hooks/useNotionSync', () => ({ useNotionSync: () => {} }));
vi.mock('@/app/reader/hooks/useFoliateEvents', () => ({ useFoliateEvents: () => {} }));
vi.mock('@/app/reader/hooks/useRendererInputListeners', () => ({
  useRendererInputListeners: () => {},
}));

vi.mock('@/app/reader/hooks/useTextSelector', () => ({
  useTextSelector: () => ({
    isTextSelected: h.isTextSelected,
    isInstantAnnotating: { current: false },
    handleScroll: vi.fn(),
    handleTouchStart: vi.fn(),
    handleTouchMove: vi.fn(),
    handleTouchEnd: vi.fn(),
    handleMouseDown: vi.fn(),
    handlePointerDown: vi.fn(),
    handlePointerMove: vi.fn(),
    handleNativeTouchMove: vi.fn(),
    handlePointerCancel: vi.fn(),
    handlePointerUp: vi.fn(),
    handleDoubleClick: vi.fn(),
    handleSelectionchange: vi.fn(),
    handleShowPopup: vi.fn(),
    handleUpToPopup: vi.fn(),
    handleContextmenu: vi.fn(),
    dragSelectionTo: vi.fn(),
    suppressNativeSelectionHandles: h.suppressNativeSelectionHandles,
    noteAutoTurnPoint: { current: null },
    cancelAutoTurn: vi.fn(),
    onAutoTurn: vi.fn(),
  }),
}));

vi.mock('@/utils/sel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/sel')>();
  return {
    ...actual,
    getPosition: () => ({ point: { x: 120, y: 200 }, dir: 'up' as const }),
    getPopupPosition: () => ({ point: { x: 120, y: 140 }, dir: 'up' as const }),
  };
});

vi.mock('@/services/transformService', () => ({
  transformContent: ({ content }: { content: string }) => Promise.resolve(content),
}));

vi.mock('@/services/ai/ask/runAskForNote', () => ({
  runAskForNote: (req: unknown, deps: unknown) => h.runAskForNote(req, deps),
}));

vi.mock('@/services/ai/ask/antigravityClient', () => ({
  completeWithAntigravity: vi.fn(),
}));

vi.mock('@/services/ai/ask/runCommand', () => ({
  tauriRunCommand: vi.fn(),
}));

vi.mock('@/app/reader/components/annotator/AnnotationRangeEditor', () => ({ default: () => null }));
vi.mock('@/app/reader/components/annotator/SelectionRangeEditor', () => ({ default: () => null }));
vi.mock('@/app/reader/components/annotator/DictionaryPopup', () => ({ default: () => null }));
vi.mock('@/app/reader/components/annotator/DictionarySheet', () => ({ default: () => null }));
vi.mock('@/app/reader/components/annotator/TranslatorPopup', () => ({ default: () => null }));
vi.mock('@/app/reader/components/annotator/ProofreadPopup', () => ({ default: () => null }));
vi.mock('@/app/reader/components/annotator/ExportMarkdownDialog', () => ({ default: () => null }));
vi.mock('@/app/reader/components/annotator/ImportAnnotationsDialog', () => ({
  default: () => null,
}));
vi.mock('@/app/reader/components/annotator/NoteEditorSheet', () => ({ default: () => null }));

vi.mock('@/app/reader/components/annotator/AnnotationPopup', () => ({
  default: (props: {
    buttons?: { tooltipText: string; onClick: () => void; disabled?: boolean }[];
  }) => (
    <div data-testid='annot-popup'>
      {(props.buttons ?? []).map((button) => (
        <button key={button.tooltipText} disabled={button.disabled} onClick={button.onClick}>
          {button.tooltipText}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('@/components/ask/AskComposer', () => ({
  default: (props: {
    open: boolean;
    selectionText: string;
    bookTitle: string;
    onClose: () => void;
    onSubmit: (question: string) => void;
  }) =>
    props.open ? (
      <div data-testid='ask-composer'>
        <span data-testid='ask-selection'>{props.selectionText}</span>
        <span data-testid='ask-book'>{props.bookTitle}</span>
        <button onClick={() => props.onSubmit('what does this mean?')}>stub-ask-submit</button>
        <button onClick={props.onClose}>stub-ask-close</button>
      </div>
    ) : null,
}));

import Annotator from '@/app/reader/components/annotator/Annotator';

const originalDispatch = eventDispatcher.dispatch.bind(eventDispatcher);

const selectText = async () => {
  if (!document.querySelector('#gridcell-book-1')) {
    const gridCell = document.createElement('div');
    gridCell.id = 'gridcell-book-1';
    document.body.append(gridCell);
  }
  const paragraph = document.createElement('p');
  paragraph.textContent = 'selected text';
  document.body.append(paragraph);
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  await act(async () => {
    await eventDispatcher.dispatch('footnote-selection', {
      key: 'book-1',
      range,
      index: 0,
      cfi: 'epubcfi(/6/2!/4/2)',
    });
  });
};

const openAskComposer = async () => {
  render(<Annotator bookKey='book-1' contentInsets={{ top: 0, right: 0, bottom: 0, left: 0 }} />);
  await selectText();
  await act(async () => {
    screen.getByText('Ask').click();
  });
};

beforeEach(() => {
  h.actions = null;
  h.config.booknotes = [];
  h.views = [];
  h.isTextSelected.current = true;
  h.runAskForNote.mockReset();
  h.runAskForNote.mockResolvedValue(true);
  h.toast.mockReset();
  h.updateBooknotes.mockImplementation((_bookKey: string, booknotes: BookNote[]) => {
    h.config.booknotes = booknotes;
    return h.config;
  });
  vi.clearAllMocks();
  vi.spyOn(eventDispatcher, 'dispatch').mockImplementation(((type: string, detail?: unknown) => {
    if (type === 'toast') h.toast(detail);
    return originalDispatch(type, detail);
  }) as typeof eventDispatcher.dispatch);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Annotator Ask → note', () => {
  test('submitting AskComposer calls runAskForNote once with selection + question', async () => {
    await openAskComposer();

    expect(screen.getByTestId('ask-composer')).toBeTruthy();
    expect(screen.getByTestId('ask-selection').textContent).toBe('selected text');
    expect(screen.getByTestId('ask-book').textContent).toBe('Test Book');

    await act(async () => {
      screen.getByText('stub-ask-submit').click();
    });

    expect(h.runAskForNote).toHaveBeenCalledTimes(1);
    expect(h.runAskForNote).toHaveBeenCalledWith(
      expect.objectContaining({
        bookHash: 'book',
        bookTitle: 'Test Book',
        selectionText: 'selected text',
        selectionCfi: 'epubcfi(/6/2!/4/2)',
        question: 'what does this mean?',
      }),
      expect.objectContaining({
        askDeps: expect.objectContaining({ agyPath: 'agy-from-settings' }),
        ensureHighlight: expect.any(Function),
        saveNote: expect.any(Function),
        toast: expect.any(Function),
        t: expect.any(Function),
      }),
    );
    // Highlight is created before runAskForNote; ensureHighlight is a no-op return.
    const deps = h.runAskForNote.mock.calls[0]![1] as {
      ensureHighlight: () => { id: string } | undefined;
    };
    expect(deps.ensureHighlight()?.id).toBeTruthy();
    expect(h.config.booknotes.some((n) => n.type === 'annotation' && !n.deletedAt)).toBe(true);
  });

  test('dismisses selection UI before headless Ask awaits', async () => {
    let resolveAsk!: (value: boolean) => void;
    let deselectBeforeAskResolved = false;
    h.runAskForNote.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          deselectBeforeAskResolved = h.deselect.mock.calls.length > 0;
          resolveAsk = resolve;
        }),
    );

    await openAskComposer();
    await act(async () => {
      screen.getByText('stub-ask-submit').click();
    });

    expect(h.deselect).toHaveBeenCalled();
    expect(deselectBeforeAskResolved).toBe(true);
    expect(screen.queryByTestId('ask-composer')).toBeNull();
    expect(screen.queryByTestId('annot-popup')).toBeNull();

    await act(async () => {
      resolveAsk(true);
    });
  });

  test('second Ask while in-flight does not call runAskForNote again', async () => {
    let resolveAsk!: (value: boolean) => void;
    h.runAskForNote.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveAsk = resolve;
        }),
    );

    await openAskComposer();
    await act(async () => {
      screen.getByText('stub-ask-submit').click();
    });
    expect(h.runAskForNote).toHaveBeenCalledTimes(1);

    // Composer closes on submit; a new selection while the first run is still
    // pending must not start another Ask.
    await selectText();
    await act(async () => {
      screen.getByText('Ask').click();
    });

    expect(h.runAskForNote).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('ask-composer')).toBeNull();
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Ask already in progress' }),
    );

    await act(async () => {
      resolveAsk(true);
    });
  });
});
