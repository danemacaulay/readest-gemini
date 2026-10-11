/**
 * Find Echoes creates a highlight while selection is live, then seeds the run
 * with annotationId (+ annotationIsNew) before opening the Notebook Echoes tab.
 */

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { eventDispatcher } from '@/utils/event';
import { BookNote } from '@/types/book';

const h = vi.hoisted(() => ({
  actions: null as null | Record<string, () => boolean>,
  config: { booknotes: [] as BookNote[], viewSettings: {} },
  viewSettings: {
    annotationToolbarItems: ['find-echoes'] as string[],
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
  requestEchoesRun: vi.fn(),
  setNotebookVisible: vi.fn(),
  setNotebookActiveTab: vi.fn(),
  openEchoesSidebar: vi.fn(),
  toast: vi.fn(),
  getCFI: vi.fn(() => 'epubcfi(/6/2!/4/2)'),
  setSelection: null as null | ((update: (prev: unknown) => unknown) => void),
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
      book: {
        format: 'EPUB',
        primaryLanguage: 'en',
        title: 'Test Book',
        author: 'Test Author',
        hash: 'book',
      },
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
    getView: () => ({ deselect: h.deselect, getCFI: h.getCFI }),
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
    setNotebookVisible: h.setNotebookVisible,
    setNotebookActiveTab: h.setNotebookActiveTab,
    setNotebookNewAnnotation: vi.fn(),
    setNotebookNewHighlightIds: vi.fn(),
  }),
}));

vi.mock('@/app/reader/utils/openEchoesSidebar', () => ({
  openEchoesSidebar: (...args: unknown[]) => h.openEchoesSidebar(...args),
}));

vi.mock('@/store/echoesUiStore', () => ({
  useEchoesUiStore: (
    selector?: (s: { requestEchoesRun: typeof h.requestEchoesRun }) => unknown,
  ) => {
    const state = { requestEchoesRun: h.requestEchoesRun };
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
  useTextSelector: (
    _bookKey: string,
    _contentInsets: unknown,
    setSelection: (update: (prev: unknown) => unknown) => void,
  ) => {
    h.setSelection = setSelection;
    return {
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
    };
  },
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
  runAskForNote: vi.fn(),
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

const tapFindEchoes = async () => {
  render(<Annotator bookKey='book-1' contentInsets={{ top: 0, right: 0, bottom: 0, left: 0 }} />);
  await selectText();
  await act(async () => {
    screen.getByText('Find Echoes').click();
  });
};

beforeEach(() => {
  h.actions = null;
  h.config.booknotes = [];
  h.views = [];
  h.isTextSelected.current = true;
  h.setSelection = null;
  h.getCFI.mockReset();
  h.getCFI.mockReturnValue('epubcfi(/6/2!/4/2)');
  h.requestEchoesRun.mockReset();
  h.setNotebookVisible.mockReset();
  h.setNotebookActiveTab.mockReset();
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

describe('Annotator Find Echoes → highlight first', () => {
  test('creates highlight and requestEchoesRun with annotationId + annotationIsNew', async () => {
    await tapFindEchoes();

    expect(h.config.booknotes.some((n) => n.type === 'annotation' && !n.deletedAt)).toBe(true);
    const created = h.config.booknotes.find((n) => n.type === 'annotation' && !n.deletedAt)!;
    expect(h.requestEchoesRun).toHaveBeenCalledTimes(1);
    expect(h.requestEchoesRun).toHaveBeenCalledWith(
      expect.objectContaining({
        bookHash: 'book',
        bookTitle: 'Test Book',
        seedText: 'selected text',
        cfi: 'epubcfi(/6/2!/4/2)',
        annotationId: created.id,
        annotationIsNew: true,
      }),
    );
  });

  test('opens left-sidebar Echoes and dismisses selection', async () => {
    await tapFindEchoes();

    expect(h.openEchoesSidebar).toHaveBeenCalled();
    expect(h.setNotebookActiveTab).not.toHaveBeenCalledWith('echoes');
    expect(h.deselect).toHaveBeenCalled();
    expect(screen.queryByTestId('annot-popup')).toBeNull();
  });

  test('reuses preexisting highlight and sets annotationIsNew false', async () => {
    const preexisting: BookNote = {
      id: 'preexisting-hl',
      type: 'annotation',
      cfi: 'epubcfi(/6/2!/4/2)',
      style: 'highlight',
      color: 'yellow',
      text: 'selected text',
      note: '',
      createdAt: 1,
      updatedAt: 1,
    };
    h.config.booknotes = [preexisting];

    await tapFindEchoes();

    expect(h.requestEchoesRun).toHaveBeenCalledWith(
      expect.objectContaining({
        annotationId: 'preexisting-hl',
        annotationIsNew: false,
      }),
    );
    const kept = h.config.booknotes.find((n) => n.id === 'preexisting-hl');
    expect(kept?.deletedAt).toBeUndefined();
  });

  test('toasts and skips requestEchoesRun when highlight cannot be anchored', async () => {
    h.getCFI.mockReturnValue(undefined as unknown as string);
    if (!document.querySelector('#gridcell-book-1')) {
      const gridCell = document.createElement('div');
      gridCell.id = 'gridcell-book-1';
      document.body.append(gridCell);
    }
    render(<Annotator bookKey='book-1' contentInsets={{ top: 0, right: 0, bottom: 0, left: 0 }} />);
    const paragraph = document.createElement('p');
    paragraph.textContent = 'selected text';
    document.body.append(paragraph);
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    // Non-popup selection with no resolvable CFI — handleHighlight creates nothing.
    await act(async () => {
      h.setSelection?.(() => ({
        key: 'book-1',
        text: 'selected text',
        range,
        index: 0,
        page: 1,
      }));
    });
    await act(async () => {
      screen.getByText('Find Echoes').click();
    });

    expect(h.requestEchoesRun).not.toHaveBeenCalled();
    expect(h.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        message: 'Could not create note anchor.',
      }),
    );
    expect(h.setNotebookVisible).not.toHaveBeenCalled();
  });
});
