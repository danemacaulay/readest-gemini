import clsx from 'clsx';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PiLink, PiX } from 'react-icons/pi';
import type { BookNote, MetaWill, MetaWillSectionId } from '@/types/book';
import { findTocItemBS } from '@/services/nav';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import {
  appendMetaWillLink,
  groupAnnotateNotesByChapter,
  META_WILL_SECTION_LABELS,
  removeMetaWillLink,
} from '@/utils/metaWill';
import { useSaveNotebookMetaWill } from '../../hooks/useSaveNotebookMetaWill';

interface MetaWillEditorProps {
  bookKey: string;
  metaWill: MetaWill;
  seedOnMount?: boolean;
  compatibilityCfi?: string | null;
}

const SAVE_DEBOUNCE_MS = 500;
const VIEWPORT_PADDING = 8;
const ANCHOR_GAP = 8;
const PICKER_WIDTH_PX = 288; // w-72

type PickerPosition = { left: number; top: number };

const getPickerPosition = (anchor: DOMRect, menuHeight: number): PickerPosition => {
  const left = Math.max(
    VIEWPORT_PADDING,
    Math.min(anchor.left, window.innerWidth - VIEWPORT_PADDING - PICKER_WIDTH_PX),
  );
  const below = anchor.bottom + ANCHOR_GAP;
  const fitsBelow = below + menuHeight <= window.innerHeight - VIEWPORT_PADDING;
  const top = fitsBelow ? below : Math.max(VIEWPORT_PADDING, anchor.top - ANCHOR_GAP - menuHeight);
  return { left, top };
};

const MetaWillEditor = ({
  bookKey,
  metaWill,
  seedOnMount = false,
  compatibilityCfi = null,
}: MetaWillEditorProps) => {
  const _ = useTranslation();
  const [draft, setDraft] = useState(metaWill);
  const [openPicker, setOpenPicker] = useState<MetaWillSectionId | null>(null);
  const [pickerPosition, setPickerPosition] = useState<PickerPosition | null>(null);
  const seededRef = useRef(false);
  const draftRef = useRef(metaWill);
  const dirtyRef = useRef(false);
  const hasLocalEditsRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linkButtonRefs = useRef<Partial<Record<MetaWillSectionId, HTMLButtonElement | null>>>({});
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const saveMetaWill = useSaveNotebookMetaWill(bookKey);
  const { getBookData, getConfig } = useBookDataStore();
  const { getView } = useReaderStore();
  const saveRef = useRef(saveMetaWill);
  saveRef.current = saveMetaWill;

  const notes = (getConfig(bookKey)?.booknotes ?? []).filter(
    (note) => note.id !== 'notebook' && note.type === 'annotation' && !note.deletedAt,
  );
  const toc = getBookData(bookKey)?.bookDoc?.toc ?? [];
  const notesByChapter = groupAnnotateNotesByChapter(notes, (note) => {
    const tocItem = findTocItemBS(toc, note.cfi);
    return { href: tocItem?.href ?? '', label: tocItem?.label ?? '' };
  });

  const closePicker = useCallback(() => {
    setOpenPicker(null);
    setPickerPosition(null);
  }, []);

  useEffect(() => {
    if (hasLocalEditsRef.current) return;
    draftRef.current = metaWill;
    setDraft(metaWill);
  }, [metaWill]);

  const flushDraft = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (!dirtyRef.current) return;

    const savingDraft = draftRef.current;
    dirtyRef.current = false;
    void saveMetaWill(savingDraft).then((persisted) => {
      if (draftRef.current !== savingDraft) return;
      if (persisted) {
        hasLocalEditsRef.current = false;
      } else {
        dirtyRef.current = true;
      }
    });
  }, [saveMetaWill]);

  useEffect(() => {
    if (!seedOnMount || !compatibilityCfi || seededRef.current) return;
    seededRef.current = true;
    if (dirtyRef.current) {
      flushDraft();
    } else {
      void saveMetaWill(draft);
    }
  }, [compatibilityCfi, draft, flushDraft, saveMetaWill, seedOnMount]);

  useEffect(() => {
    if (!dirtyRef.current) return;
    timeoutRef.current = setTimeout(flushDraft, SAVE_DEBOUNCE_MS);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [draft, flushDraft]);

  useEffect(
    () => () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (dirtyRef.current) {
        dirtyRef.current = false;
        void saveRef.current(draftRef.current);
      }
    },
    [],
  );

  useLayoutEffect(() => {
    if (!openPicker) {
      setPickerPosition(null);
      return;
    }
    const anchor = linkButtonRefs.current[openPicker];
    const menu = pickerRef.current;
    if (!anchor || !menu) return;
    const menuHeight = menu.getBoundingClientRect().height;
    setPickerPosition(getPickerPosition(anchor.getBoundingClientRect(), menuHeight));
  }, [openPicker, notesByChapter.length]);

  useEffect(() => {
    if (!openPicker) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (pickerRef.current?.contains(target)) return;
      if (linkButtonRefs.current[openPicker]?.contains(target)) return;
      closePicker();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closePicker();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [closePicker, openPicker]);

  const updateDraft = (next: MetaWill) => {
    draftRef.current = next;
    dirtyRef.current = true;
    hasLocalEditsRef.current = true;
    setDraft(next);
  };

  const linkNote = (sectionId: MetaWillSectionId, note: BookNote, chapterLabel: string) => {
    updateDraft(
      appendMetaWillLink(draftRef.current, sectionId, {
        booknoteId: note.id,
        excerpt: note.text || note.note || _('Annotation'),
        chapterLabel,
      }),
    );
    closePicker();
  };

  const unlinkNote = (sectionId: MetaWillSectionId, booknoteId: string) => {
    updateDraft(removeMetaWillLink(draftRef.current, sectionId, booknoteId));
  };

  const navigateToNote = (booknoteId: string) => {
    const note = getConfig(bookKey)?.booknotes?.find(
      (candidate) => candidate.id === booknoteId && !candidate.deletedAt,
    );
    if (!note?.cfi) return;
    void eventDispatcher.dispatch('navigate', { bookKey, cfi: note.cfi });
    getView(bookKey)?.goTo(note.cfi);
  };

  return (
    <div className='flex h-full min-h-0 flex-col gap-3 overflow-y-auto'>
      {draft.sections.map((section) => {
        const label = _(META_WILL_SECTION_LABELS[section.id]);
        const isPickerOpen = openPicker === section.id;
        return (
          <section
            key={section.id}
            data-meta-will-section={section.id}
            className='flex shrink-0 flex-col gap-1 text-sm font-medium'
          >
            <span>{label}</span>
            <textarea
              aria-label={label}
              value={section.text}
              onBlur={flushDraft}
              onChange={(event) => {
                const text = event.currentTarget.value;
                setDraft((current) => {
                  const next = {
                    sections: current.sections.map((candidate) =>
                      candidate.id === section.id ? { ...candidate, text } : candidate,
                    ),
                  };
                  draftRef.current = next;
                  dirtyRef.current = true;
                  hasLocalEditsRef.current = true;
                  return next;
                });
              }}
              className='eink-bordered border-base-300 bg-base-100 min-h-24 resize-y rounded-lg border p-2 font-normal'
              dir='auto'
              spellCheck
            />
            {section.links.length > 0 && (
              <ul className='flex flex-col gap-1'>
                {section.links.map((link) => (
                  <li
                    key={link.booknoteId}
                    className='eink-bordered border-base-300 bg-base-100 flex items-center rounded-lg border font-normal'
                  >
                    <button
                      type='button'
                      aria-label={_('Go to linked note')}
                      className='min-w-0 flex-1 px-2 py-1.5 text-start'
                      onClick={() => navigateToNote(link.booknoteId)}
                    >
                      {link.chapterLabel && (
                        <span className='text-base-content/60 block truncate text-xs'>
                          {link.chapterLabel}
                        </span>
                      )}
                      <span className='line-clamp-2'>{link.excerpt}</span>
                    </button>
                    <button
                      type='button'
                      aria-label={_('Remove linked note')}
                      className='eink-bordered btn btn-ghost h-8 min-h-8 shrink-0 px-2'
                      onClick={() => unlinkNote(section.id, link.booknoteId)}
                    >
                      <PiX aria-hidden='true' className='size-4' />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className={clsx('dropdown relative self-start', isPickerOpen && 'dropdown-open')}>
              <button
                type='button'
                ref={(node) => {
                  linkButtonRefs.current[section.id] = node;
                }}
                aria-expanded={isPickerOpen}
                aria-haspopup='listbox'
                className='eink-bordered btn btn-ghost h-8 min-h-8 gap-1 px-2 text-xs font-normal'
                onClick={() =>
                  setOpenPicker((current) => (current === section.id ? null : section.id))
                }
              >
                <PiLink aria-hidden='true' className='size-4' />
                {_('Link note')}
              </button>
            </div>
          </section>
        );
      })}
      {openPicker && (
        <div
          ref={pickerRef}
          role='listbox'
          aria-label={_('Link note')}
          className={clsx(
            'eink-bordered border-base-300 bg-base-100 fixed z-50 max-h-64 w-72 overflow-y-auto rounded-lg border p-1 shadow-2xl',
            !pickerPosition && 'invisible',
          )}
          style={{
            left: pickerPosition?.left ?? 0,
            top: pickerPosition?.top ?? 0,
          }}
        >
          {notes.length === 0 ? (
            <div className='text-base-content/60 px-2 py-1.5 text-sm font-normal'>
              {_('No annotations to link')}
            </div>
          ) : (
            notesByChapter.map((group) => (
              <div key={group.href || group.label}>
                {group.label && (
                  <div className='text-base-content/60 truncate px-2 py-1 text-xs'>
                    {group.label}
                  </div>
                )}
                {group.notes.map((note) => (
                  <button
                    key={note.id}
                    type='button'
                    role='option'
                    className='hover:bg-base-200 block w-full rounded-md px-2 py-1.5 text-start text-sm font-normal'
                    onClick={() => linkNote(openPicker, note, group.label)}
                  >
                    <span className='line-clamp-2'>
                      {note.text || note.note || _('Annotation')}
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default MetaWillEditor;
