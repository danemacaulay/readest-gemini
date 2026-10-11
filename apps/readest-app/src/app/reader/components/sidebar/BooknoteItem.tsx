import clsx from 'clsx';
import React, { useMemo, useRef } from 'react';
import { MdEdit, MdDelete, MdContentCopy } from 'react-icons/md';

import { useEnv } from '@/context/EnvContext';
import { BookNote, HighlightColor } from '@/types/book';
import { useSettingsStore } from '@/store/settingsStore';
import { useReaderStore } from '@/store/readerStore';
import { useNotebookStore } from '@/store/notebookStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useMetaWillUiStore } from '@/store/metaWillUiStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useResponsiveSize } from '@/hooks/useResponsiveSize';
import { useLongPress } from '@/hooks/useLongPress';
import { eventDispatcher } from '@/utils/event';
import { isCfiInLocation } from '@/utils/cfi';
import { buildAnnotationUrl } from '@/utils/deeplink';
import { buildAnnotationCopyMarkdown } from '@/utils/note';
import { writeTextToClipboard } from '@/utils/clipboard';
import { nextBooknoteStamp } from '@/utils/booknoteStamp';
import { DEFAULT_NOTE_EXPORT_CONFIG } from '@/services/constants';
import { removeBookNoteOverlays } from '../../utils/annotatorUtil';
import { parseNoteMarkdown } from '../../utils/noteMarkdown';
import { useSaveBooknoteNoteText } from '../../hooks/useSaveBooknoteNoteText';
import { useSaveAskRegisterFeedback } from '../../hooks/useSaveAskRegisterFeedback';
import { useInlineTextEditor } from '../../hooks/useInlineTextEditor';
import TextButton from '@/components/TextButton';
import TextEditor from '@/components/TextEditor';
import { BooknoteTimeLabel } from './BooknoteTime';
import AskRegisters from './AskRegisters';
import { parseEchoNoteRef } from '@/services/echoes/createEchoStub';
import { getPersistentEchoStore } from '@/services/echoes/echoStore';
import { deleteEchoTrail } from '@/services/echoes/echoSync';
import { fileSystemFromAppService } from '@/services/ai/fileSystemFromAppService';
import { useEchoesUiStore } from '@/store/echoesUiStore';
import { setAskProposal, toggleAskReaction } from '@/utils/askRegisterFeedback';
import { renderAskRegistersMarkdown } from '@/utils/askRegisters';
import { appendMetaWillLink } from '@/utils/metaWill';
import { useSaveNotebookMetaWill } from '../../hooks/useSaveNotebookMetaWill';

interface BooknoteItemProps {
  bookKey: string;
  item: BookNote;
  isNearest?: boolean;
  onClick?: () => void;
  inlineNoteEditing?: boolean;
  /** From parent noteId→trailId index; avoids per-row store.list(). */
  linkedTrailId?: string | null;
}

const BooknoteItem: React.FC<BooknoteItemProps> = ({
  bookKey,
  item,
  isNearest,
  onClick,
  inlineNoteEditing,
  linkedTrailId = null,
}) => {
  const _ = useTranslation();
  const { envConfig, appService } = useEnv();
  const { settings } = useSettingsStore();
  const { getConfig, saveConfig, updateBooknotes } = useBookDataStore();
  const { getProgress, getView, getViewsById, getViewSettings } = useReaderStore();
  const { isNotebookVisible, setNotebookEditAnnotation, setNotebookVisible, setNotebookActiveTab } =
    useNotebookStore();

  const globalReadSettings = settings.globalReadSettings;
  const customColors = globalReadSettings.customHighlightColors;

  const { text, cfi, note } = item;
  const isBookmark = item.type === 'bookmark';
  // Prefer explicit type; also treat echo: refs as echoes so a mistyped stub
  // never falls through to navigate/goTo (which feels like a duplicate open).
  // Native annotation-linked trails are NOT stubs — they render as normal notes.
  const isEcho = item.type === 'echo' || !!parseEchoNoteRef(item.note ?? '');
  const saveBooknoteNoteText = useSaveBooknoteNoteText(bookKey);
  const saveAskFeedback = useSaveAskRegisterFeedback(bookKey);
  const saveMetaWill = useSaveNotebookMetaWill(bookKey);
  const askRegisters = item.askRegisters;
  const hasAskRegisters = !!askRegisters?.length;

  const openLinkedEchoTrail = (trailId: string) => {
    useEchoesUiStore.getState().setActiveEchoId(trailId);
    setNotebookVisible(true);
    setNotebookActiveTab('echoes');
  };

  const cascadeDeleteEchoTrail = (trailId: string) => {
    if (!appService) return;
    const activeId = useEchoesUiStore.getState().activeEchoId;
    if (activeId === trailId) {
      useEchoesUiStore.getState().setActiveEchoId(null);
    }
    try {
      const store = getPersistentEchoStore(fileSystemFromAppService(appService));
      void deleteEchoTrail(store, trailId);
    } catch {
      // Store unavailable — stub/annotation is already gone; trail may need library reconcile.
    }
  };
  const saveBookmarkText = (draftText: string) => {
    const config = getConfig(bookKey);
    if (!config || !draftText) return;
    const { booknotes: annotations = [] } = config;
    const existingIndex = annotations.findIndex((annotation) => item.id === annotation.id);
    if (existingIndex === -1) return;
    annotations[existingIndex]!.updatedAt = nextBooknoteStamp(annotations[existingIndex]!);
    annotations[existingIndex]!.text = draftText;
    const updatedConfig = updateBooknotes(bookKey, annotations);
    if (updatedConfig) {
      saveConfig(envConfig, bookKey, updatedConfig, settings);
    }
  };
  const { editorRef, draftText, setDraftText, inlineEditMode, startEdit, cancelEdit, save } =
    useInlineTextEditor((draftText) => {
      if (isBookmark) return saveBookmarkText(draftText);
      else return saveBooknoteNoteText(item.id, draftText);
    });
  const separatorWidth = useResponsiveSize(3);
  const size18 = useResponsiveSize(18);

  const progress = getProgress(bookKey);
  // Active highlight: keep visual "current" state but don't scroll from the
  // item itself anymore — the parent (virtualized) BooknoteView handles
  // scrolling via virtuosoRef.scrollToIndex, avoiding N getBoundingClientRect
  // calls when the list grows large.
  const isCurrent = useMemo(
    () => isCfiInLocation(cfi, progress?.location) || !!isNearest,
    [cfi, progress?.location, isNearest],
  );

  // parseNoteMarkdown is heavy when called on every list scroll re-render
  // across hundreds of items. Cache by note text — note edits change
  // item.note and bust the cache automatically.
  const noteHtml = useMemo(() => (note ? parseNoteMarkdown(note) : ''), [note]);

  // iOS WebKit applies :hover at touchstart, so every scroll touch would expand
  // the card under the finger (#6568). There a long press reveals the actions
  // instead, and the click that iOS sends after it must not navigate.
  const revealOnHover = !appService?.isIOSApp;
  const itemRef = useRef<HTMLLIElement>(null);
  const longPressedRef = useRef(false);
  const { handlers: longPressHandlers } = useLongPress(
    {
      onLongPress: () => {
        longPressedRef.current = true;
        itemRef.current?.focus({ preventScroll: true });
      },
      threshold: 300,
    },
    [],
  );

  const handleClickItem = (event: React.MouseEvent | React.KeyboardEvent) => {
    event.preventDefault();
    if (event.type === 'click' && longPressedRef.current) {
      longPressedRef.current = false;
      return;
    }
    // Echo stubs open the notebook Echoes tab; skip page navigate/goTo so we
    // don't hide the notebook (unpinned) or remount a reader for the same book.
    if (isEcho) {
      onClick?.();
      return;
    }
    const focusedSectionId = useMetaWillUiStore.getState().focusedSectionId;
    const isMobile =
      appService?.isMobile === true || window.innerWidth < 640 || window.innerHeight < 640;
    const notebook = getConfig(bookKey)?.booknotes?.find(
      (note) =>
        note.id === 'notebook' &&
        note.type === 'notebook' &&
        !note.deletedAt &&
        note.metaWill !== undefined,
    );
    if (
      !isMobile &&
      isNotebookVisible &&
      focusedSectionId &&
      item.type === 'annotation' &&
      notebook?.metaWill
    ) {
      void saveMetaWill(
        appendMetaWillLink(notebook.metaWill, focusedSectionId, {
          booknoteId: item.id,
          excerpt: item.text || item.note || _('Annotation'),
        }),
      );
      return;
    }
    // Native annotation-linked trails open Echoes in place (parent shared index).
    if (linkedTrailId) {
      openLinkedEchoTrail(linkedTrailId);
      return;
    }
    eventDispatcher.dispatch('navigate', { bookKey, cfi });

    onClick?.();
    getView(bookKey)?.goTo(cfi);
  };

  const deleteNote = (note: BookNote) => {
    if (!bookKey) return;
    const config = getConfig(bookKey);
    if (!config) return;
    const { booknotes = [] } = config;
    booknotes.forEach((item) => {
      if (item.id === note.id) {
        item.deletedAt = nextBooknoteStamp(item);
        const views = getViewsById(bookKey.split('-')[0]!);
        views.forEach((view) => removeBookNoteOverlays(view, item));
      }
    });
    const updatedConfig = updateBooknotes(bookKey, booknotes);
    if (updatedConfig) {
      saveConfig(envConfig, bookKey, updatedConfig, settings);
    }

    // Book-side pointers (legacy stub or native annotation) cascade into
    // Books/_echoes/echoes.json so Library → Echoes does not keep orphans.
    const stubTrailId = parseEchoNoteRef(note.note ?? '');
    if (stubTrailId) {
      cascadeDeleteEchoTrail(stubTrailId);
      return;
    }
    if (linkedTrailId) {
      cascadeDeleteEchoTrail(linkedTrailId);
      return;
    }
    if (!appService) return;
    void (async () => {
      try {
        const store = getPersistentEchoStore(fileSystemFromAppService(appService));
        const trails = await store.list();
        const linked = trails.find((t) => t.noteId === note.id || t.seed.annotationId === note.id);
        if (linked) cascadeDeleteEchoTrail(linked.id);
      } catch {
        // Store unavailable — annotation is already gone; trail may need library reconcile.
      }
    })();
  };

  const editNote = (note: BookNote) => {
    setNotebookVisible(true);
    setNotebookEditAnnotation(note);
  };

  const buildSourceMarkdown = () => {
    const bookHash = item.bookHash || bookKey.split('-')[0]!;
    const linkType =
      getViewSettings(bookKey)?.noteExportConfig?.linkType ?? DEFAULT_NOTE_EXPORT_CONFIG.linkType;
    const url = buildAnnotationUrl({ bookHash, noteId: item.id, cfi: item.cfi }, linkType);
    const linkLabel = item.page
      ? _('Page: {{number}}', { number: item.page })
      : _('Open in Readest');
    return {
      bookHash,
      markdown: buildAnnotationCopyMarkdown({
        text: item.text,
        note: item.note,
        noteLabel: _('Note'),
        askRegistersMarkdown: item.askRegisters?.length
          ? renderAskRegistersMarkdown(item.askRegisters)
          : undefined,
        askLabel: _('Ask'),
        url,
        linkLabel,
      }),
    };
  };

  const handleCopyLink = () => {
    const { markdown } = buildSourceMarkdown();
    void writeTextToClipboard(markdown);
    eventDispatcher.dispatch('toast', {
      type: 'info',
      message: _('Copied to clipboard'),
      className: 'whitespace-nowrap',
      timeout: 2000,
    });
  };

  const editBookmark = () => startEdit(text || '');

  const editNoteInline = () => startEdit(item.note || '');

  if (inlineEditMode) {
    return (
      <div
        data-testid='booknote-note-editor'
        className={clsx(
          'border-base-300 content group relative my-2 cursor-pointer rounded-lg p-2',
          isCurrent ? 'bg-base-300/85 hover:bg-base-300' : 'hover:bg-base-300/55 bg-base-100',
          'transition-all duration-300 ease-in-out',
        )}
      >
        {/* Same anatomy as AnnotationNoteEditor — the field, then a
            bottom-right Cancel/Save row — so a note reads the same whichever
            editor opened it. This one keeps its content height: it sits in a
            list row, not in a sized popup or sheet. */}
        <div className='flex flex-col gap-2 p-2'>
          <TextEditor
            className='leading-normal!'
            ref={editorRef}
            value={draftText}
            onChange={setDraftText}
            onSave={save}
            onEscape={cancelEdit}
            placeholder={isBookmark ? undefined : _('Add Note')}
            spellCheck={false}
            autoFocus
          />
          <div className='flex shrink-0 justify-end gap-3' dir='ltr'>
            <TextButton onClick={cancelEdit}>{_('Cancel')}</TextButton>
            <TextButton onClick={save} disabled={isBookmark && !draftText}>
              {_('Save')}
            </TextButton>
          </div>
        </div>
      </div>
    );
  }

  const isEditable =
    !isEcho &&
    (!!item.note ||
      hasAskRegisters ||
      isBookmark ||
      (!!inlineNoteEditing && item.type === 'annotation'));
  const actionButtonReveal = clsx(
    'group-focus-within:opacity-100',
    revealOnHover && 'group-hover:opacity-100',
  );

  const startYourNote = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inlineNoteEditing) {
      startEdit(item.note || '');
      return;
    }
    editNote(item);
  };

  const askRegistersBlock =
    hasAskRegisters && askRegisters ? (
      <div
        className='mt-2'
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className='border-base-300 mb-2 border-t pt-2'>
          <div className='content font-size-xs mb-1.5 opacity-70'>{_('Ask · read only')}</div>
          <AskRegisters
            registers={askRegisters}
            onReact={(kind, reaction) => {
              void saveAskFeedback(item.id, kind, (feedback) =>
                toggleAskReaction(feedback, reaction, Date.now()),
              );
            }}
            onProposal={(kind, text) => {
              void saveAskFeedback(item.id, kind, (feedback) =>
                setAskProposal(feedback, text, Date.now()),
              );
            }}
          />
        </div>
      </div>
    ) : null;

  return (
    <li
      // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
      role='button'
      aria-current={isCurrent ? 'page' : undefined}
      className={clsx(
        'booknote-item border-base-300 content group relative my-2 cursor-pointer rounded-lg p-2',
        isCurrent
          ? 'bg-base-300/85 hover:bg-base-300 focus:bg-base-300'
          : 'hover:bg-base-300/55 focus:bg-base-300/55 bg-base-100',
        'transition-all duration-300 ease-in-out',
      )}
      ref={itemRef}
      tabIndex={0}
      onClick={handleClickItem}
      {...(!revealOnHover && {
        onPointerDown: (e: React.PointerEvent) => {
          longPressedRef.current = false;
          longPressHandlers.onPointerDown(e);
        },
        onPointerMove: longPressHandlers.onPointerMove,
        onPointerUp: longPressHandlers.onPointerUp,
        onPointerCancel: longPressHandlers.onPointerCancel,
        onPointerLeave: longPressHandlers.onPointerLeave,
      })}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          handleClickItem(e);
        } else {
          e.stopPropagation();
        }
      }}
    >
      <div
        className={clsx('min-h-4 p-0 transition-all duration-300 ease-in-out')}
        style={
          {
            '--top-override': '0.7rem',
            '--end-override': '0.3rem',
          } as React.CSSProperties
        }
      >
        {isEcho ? (
          <div className='content font-size-sm mb-1 font-medium'>{_('Echo · Saved trail')}</div>
        ) : (
          (item.note || hasAskRegisters) && (
            <>
              {item.contribution === 'ai' || item.contribution === 'co-authored' ? (
                <div
                  className='content font-size-xs mb-0.5 opacity-70'
                  data-testid='booknote-contribution'
                >
                  {item.contribution === 'ai' ? _('AI') : _('Co')}
                </div>
              ) : null}
              {hasAskRegisters ? (
                <>
                  {item.note ? (
                    <div
                      className='content prose prose-sm font-size-sm'
                      dir='auto'
                      dangerouslySetInnerHTML={{ __html: noteHtml }}
                    ></div>
                  ) : (
                    <button
                      type='button'
                      className='content font-size-sm text-base-content/50 border-base-300 eink-bordered w-full rounded-lg border border-dashed px-2 py-2 text-start'
                      onClick={startYourNote}
                    >
                      {_('Add your thoughts…')}
                    </button>
                  )}
                  {askRegistersBlock}
                </>
              ) : (
                item.note && (
                  <div
                    className='content prose prose-sm font-size-sm'
                    dir='auto'
                    dangerouslySetInnerHTML={{ __html: noteHtml }}
                  ></div>
                )
              )}
            </>
          )
        )}
        <div className='flex items-start'>
          {(item.note || isEcho || hasAskRegisters) && (
            <div
              className='me-2 mt-2.5 min-h-full self-stretch rounded-xl bg-gray-300'
              style={{
                minWidth: `${separatorWidth}px`,
              }}
            ></div>
          )}
          <div
            className={clsx(
              'content font-size-sm line-clamp-3',
              (item.note || isEcho || hasAskRegisters) && 'mt-2',
            )}
          >
            <span
              className={clsx(
                'booknote-text inline leading-normal',
                (item.note || isEcho || hasAskRegisters) &&
                  'content font-size-xs text-base-content',
                (item.style === 'underline' || item.style === 'squiggly') &&
                  'underline decoration-2',
                item.style === 'highlight' && 'rounded-[4px] px-[2px] py-[1px]',
                item.style === 'squiggly' && 'decoration-wavy',
              )}
              style={
                {
                  ...(item.style === 'highlight'
                    ? {
                        backgroundColor: `color-mix(in srgb, ${customColors[item.color as HighlightColor] || item.color} calc(var(--overlayer-highlight-opacity, 0.3) * 100%), transparent)`,
                      }
                    : {}),
                  ...(item.style === 'underline' || item.style === 'squiggly'
                    ? {
                        textDecorationColor: `color-mix(in srgb, ${customColors[item.color as HighlightColor] || item.color} 80%, transparent)`,
                      }
                    : {}),
                } as React.CSSProperties
              }
            >
              {text || ''}
            </span>
          </div>
        </div>
      </div>
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div
        className={clsx(
          'max-h-0 overflow-hidden p-0',
          'transition-[max-height] duration-300 ease-in-out',
          'group-focus-within:overflow-visible',
          isEditable ? 'group-focus-within:max-h-12' : 'group-focus-within:max-h-8',
          revealOnHover && 'group-hover:overflow-visible',
          revealOnHover && (isEditable ? 'group-hover:max-h-12' : 'group-hover:max-h-8'),
        )}
        style={
          {
            '--bottom-override': 0,
          } as React.CSSProperties
        }
        // This is needed to prevent the parent onClick from being triggered
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={clsx(
            'flex cursor-default items-center justify-between py-2',
            isEditable && 'flex-col',
          )}
        >
          <div className='flex w-full items-center gap-1 truncate'>
            <span className='truncate text-sm text-gray-500 sm:text-xs'>
              {item.page ? _('p {{page}}' + ' · ', { page: item.page }) : ''}
            </span>
            <BooknoteTimeLabel createdAt={item.createdAt} />
          </div>
          <div
            className={clsx('flex items-center justify-end gap-4', isEditable && 'w-full')}
            dir='ltr'
          >
            <button
              onClick={handleCopyLink}
              className={clsx(
                'btn btn-ghost btn-xs text-base-content p-0 opacity-0 transition duration-300 ease-in-out hover:border-transparent hover:bg-transparent',
                actionButtonReveal,
              )}
              aria-label={_('Copy')}
            >
              <MdContentCopy size={size18} />
            </button>

            <button
              onClick={deleteNote.bind(null, item)}
              className={clsx(
                'btn btn-ghost btn-xs p-0 text-red-500 opacity-0 transition duration-300 ease-in-out hover:border-transparent hover:bg-transparent',
                actionButtonReveal,
              )}
              aria-label={_('Delete')}
            >
              <MdDelete size={size18} />
            </button>

            {isEditable && (
              <button
                onClick={
                  item.type === 'bookmark'
                    ? editBookmark
                    : inlineNoteEditing
                      ? editNoteInline
                      : editNote.bind(null, item)
                }
                className={clsx(
                  'btn btn-ghost btn-xs p-0 text-blue-500 opacity-0 transition duration-300 ease-in-out hover:border-transparent hover:bg-transparent',
                  actionButtonReveal,
                )}
                aria-label={item.note || item.type === 'bookmark' ? _('Edit') : _('Add Note')}
              >
                <MdEdit size={size18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
};

// Memoize: BooknoteView re-renders on every progress tick / config change.
// Without React.memo each tick would re-render every visible note row even
// though their props are unchanged. Default shallow compare is enough since
// `item` and `onClick` are stable references from the parent's useMemo /
// useCallback.
export default React.memo(BooknoteItem);
