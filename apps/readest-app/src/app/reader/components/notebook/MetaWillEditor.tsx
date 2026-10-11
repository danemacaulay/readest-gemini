import { useEffect, useRef, useState } from 'react';
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
  const saveMetaWill = useSaveNotebookMetaWill(bookKey);

  useEffect(() => {
    setDraft(metaWill);
  }, [metaWill]);

  useEffect(() => {
    if (!seedOnMount || !compatibilityCfi || seededRef.current) return;
    seededRef.current = true;
    void saveMetaWill(draft);
  }, [compatibilityCfi, draft, saveMetaWill, seedOnMount]);

  useEffect(() => {
    if (draft === metaWill) return;
    const timeout = setTimeout(() => void saveMetaWill(draft), SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [draft, metaWill, saveMetaWill]);

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
              onChange={(event) => {
                const text = event.currentTarget.value;
                setDraft((current) => ({
                  sections: current.sections.map((candidate) =>
                    candidate.id === section.id ? { ...candidate, text } : candidate,
                  ),
                }));
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
