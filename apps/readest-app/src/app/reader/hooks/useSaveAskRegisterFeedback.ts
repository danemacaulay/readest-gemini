import { useCallback } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { eventDispatcher } from '@/utils/event';
import { useEnv } from '@/context/EnvContext';
import { useSettingsStore } from '@/store/settingsStore';
import { useBookDataStore } from '@/store/bookDataStore';
import type { AskRegisterFeedback, AskRegisterKind } from '@/types/book';
import { updateAskRegisterFeedback } from '@/utils/askRegisterFeedback';

export function useSaveAskRegisterFeedback(bookKey: string) {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const { settings } = useSettingsStore();
  const { getConfig, saveConfig, updateBooknotes } = useBookDataStore();

  return useCallback(
    async (
      noteId: string,
      kind: AskRegisterKind,
      transform: (feedback: AskRegisterFeedback | undefined) => AskRegisterFeedback,
    ): Promise<boolean> => {
      const config = getConfig(bookKey);
      if (!config) return false;

      const previousBooknotes = config.booknotes ?? [];
      const result = updateAskRegisterFeedback(previousBooknotes, noteId, kind, transform);
      if (!result) return false;

      const updatedConfig = updateBooknotes(bookKey, result.booknotes);
      if (!updatedConfig) return false;

      try {
        await saveConfig(envConfig, bookKey, updatedConfig, settings);
        return true;
      } catch {
        const latest = getConfig(bookKey)?.booknotes;
        if (latest?.includes(result.updatedBooknote)) {
          updateBooknotes(bookKey, previousBooknotes);
        }
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: _('Failed to save feedback. Please try again.'),
        });
        return false;
      }
    },
    [bookKey, envConfig, settings, getConfig, saveConfig, updateBooknotes, _],
  );
}
