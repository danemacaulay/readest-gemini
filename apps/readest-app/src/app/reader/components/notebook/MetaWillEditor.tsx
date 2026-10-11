import { useCallback, useEffect, useRef, useState } from 'react';
import type { MetaWill } from '@/types/book';
import { META_WILL_SECTION_LABELS } from '@/utils/metaWill';
import { useSaveNotebookMetaWill } from '../../hooks/useSaveNotebookMetaWill';

interface MetaWillEditorProps {
  bookKey: string;
  metaWill: MetaWill;
  seedOnMount?: boolean;
  compatibilityCfi?: string | null;
}

const SAVE_DEBOUNCE_MS = 500;

const MetaWillEditor = ({
  bookKey,
  metaWill,
  seedOnMount = false,
  compatibilityCfi = null,
}: MetaWillEditorProps) => {
  const [draft, setDraft] = useState(metaWill);
  const seededRef = useRef(false);
  const draftRef = useRef(metaWill);
  const dirtyRef = useRef(false);
  const hasLocalEditsRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveMetaWill = useSaveNotebookMetaWill(bookKey);
  const saveRef = useRef(saveMetaWill);
  saveRef.current = saveMetaWill;

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

  return (
    <div className='flex h-full min-h-0 flex-col gap-3 overflow-y-auto'>
      {draft.sections.map((section) => {
        const label = META_WILL_SECTION_LABELS[section.id];
        return (
          <label key={section.id} className='flex shrink-0 flex-col gap-1 text-sm font-medium'>
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
          </label>
        );
      })}
    </div>
  );
};

export default MetaWillEditor;
