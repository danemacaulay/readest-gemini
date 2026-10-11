import { useCallback } from 'react';
import { useEnv } from '@/context/EnvContext';
import { useBookDataStore } from '@/store/bookDataStore';
import { useNotebookDocumentStore } from '@/store/notebookDocumentStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { MetaWill } from '@/types/book';
import { composeMetaWillNote } from '@/utils/metaWill';
import { upsertNotebookRecord } from '../utils/notebookDocument';

export function useSaveNotebookMetaWill(bookKey: string) {
  const { envConfig } = useEnv();
  const { settings } = useSettingsStore();
  const { getConfig, saveConfig, updateBooknotes } = useBookDataStore();

  return useCallback(
    async (metaWill: MetaWill): Promise<void> => {
      const config = getConfig(bookKey);
      if (!config) return;

      const note = composeMetaWillNote(metaWill);
      const update = upsertNotebookRecord(
        config.booknotes ?? [],
        note,
        config.location || null,
        Date.now(),
        true,
        metaWill,
      );
      const bookHash = bookKey.split('-')[0]!;
      if (!update) {
        useNotebookDocumentStore.getState().markSaveFailed(bookHash, true);
        return;
      }

      const updatedConfig = updateBooknotes(bookKey, update.booknotes);
      if (!updatedConfig) return;
      await saveConfig(envConfig, bookKey, updatedConfig, settings);

      const documentStore = useNotebookDocumentStore.getState();
      documentStore.hydrate(bookHash, note, update.notebook.updatedAt);
      const session = useNotebookDocumentStore.getState().sessions[bookHash];
      if (session) {
        documentStore.markSaved(bookHash, session.revision, note, update.notebook.updatedAt);
      }
    },
    [bookKey, envConfig, getConfig, saveConfig, settings, updateBooknotes],
  );
}
