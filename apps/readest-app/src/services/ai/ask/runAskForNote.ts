import { mapAskError } from '@/components/ask/askErrors';
import { runAsk as defaultRunAsk, type AskDeps } from './askService';
import type { AskRequest } from './types';

export type AskForNoteDeps = {
  runAsk?: typeof defaultRunAsk;
  askDeps: AskDeps;
  ensureHighlight: () => { id: string } | null | undefined;
  saveNote: (annotationId: string, note: string) => Promise<boolean>;
  toast: (opts: { type: 'info' | 'error'; message: string }) => void;
  t: (key: string) => string;
};

export async function runAskForNote(input: AskRequest, deps: AskForNoteDeps): Promise<boolean> {
  const target = deps.ensureHighlight();
  if (!target?.id) {
    deps.toast({ type: 'error', message: deps.t('Could not create note anchor.') });
    return false;
  }

  const ask = deps.runAsk ?? defaultRunAsk;
  try {
    const result = await ask(input, deps.askDeps);
    const saved = await deps.saveNote(target.id, result.answer);
    // saveNote (useSaveBooknoteNoteText) already toasts on failure — don't double-toast.
    if (!saved) return false;
    deps.toast({
      type: 'info',
      message: deps.t('Ask answer saved as note'),
    });
    return true;
  } catch (err) {
    deps.toast({ type: 'error', message: mapAskError(err).message });
    return false;
  }
}
