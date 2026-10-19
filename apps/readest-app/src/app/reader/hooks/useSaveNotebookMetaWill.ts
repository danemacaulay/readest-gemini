import { useCallback, useRef } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useBookDataStore } from '@/store/bookDataStore';
import { useNotebookDocumentStore } from '@/store/notebookDocumentStore';
import { getBookProgress } from '@/store/readerProgressStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { MetaWill } from '@/types/book';
import { composeMetaWillNote } from '@/utils/metaWill';
import { resolveNotebookCompatibilityCfi, upsertNotebookRecord } from '../utils/notebookDocument';

export function useSaveNotebookMetaWill(bookKey: string) {
  const { envConfig } = useEnv();
  const { settings } = useSettingsStore();
  const { getConfig, saveConfig, updateBooknotes } = useBookDataStore();
  const queueRef = useRef<{ run: () => Promise<boolean>; resolve: (persisted: boolean) => void }[]>(
    [],
  );
  const savingRef = useRef(false);

  const persist = useCallback(
    async (metaWill: MetaWill): Promise<boolean> => {
      const config = getConfig(bookKey);
      if (!config) return false;

      const previousBooknotes = config.booknotes ?? [];
      const note = composeMetaWillNote(metaWill);
      const compatibilityCfi = resolveNotebookCompatibilityCfi(
        config.location,
        getBookProgress(bookKey)?.location,
      );
      const update = upsertNotebookRecord(
        previousBooknotes,
        note,
        compatibilityCfi,
        Date.now(),
        true,
        metaWill,
      );
      const bookHash = bookKey.split('-')[0]!;
      if (!update) {
        useNotebookDocumentStore.getState().markSaveFailed(bookHash, true);
        return false;
      }

      const updatedConfig = updateBooknotes(bookKey, update.booknotes);
      if (!updatedConfig) return false;
      try {
        await saveConfig(envConfig, bookKey, updatedConfig, settings);

        const documentStore = useNotebookDocumentStore.getState();
        documentStore.hydrate(bookHash, note, update.notebook.updatedAt);
        const session = useNotebookDocumentStore.getState().sessions[bookHash];
        if (session) {
          documentStore.markSaved(bookHash, session.revision, note, update.notebook.updatedAt);
        }
        return true;
      } catch {
        const latest = getConfig(bookKey)?.booknotes;
        if (latest?.includes(update.notebook)) {
          updateBooknotes(bookKey, previousBooknotes);
        }
        useNotebookDocumentStore.getState().markSaveFailed(bookHash);
        return false;
      }
    },
    [bookKey, envConfig, getConfig, saveConfig, settings, updateBooknotes],
  );

  return useCallback(
    (metaWill: MetaWill): Promise<boolean> =>
      new Promise((resolve) => {
        queueRef.current.push({ run: () => persist(metaWill), resolve });
        if (savingRef.current) return;

        savingRef.current = true;
        void (async () => {
          try {
            while (queueRef.current.length > 0) {
              const job = queueRef.current.shift()!;
              job.resolve(await job.run());
            }
          } finally {
            savingRef.current = false;
          }
        })();
      }),
    [persist],
  );
}
