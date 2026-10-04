'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useEnv } from '@/context/EnvContext';
import { useAppRouter } from '@/hooks/useAppRouter';
import { useTranslation } from '@/hooks/useTranslation';
import { useAIChatStore } from '@/store/aiChatStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useEchoesUiStore } from '@/store/echoesUiStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useNotebookStore } from '@/store/notebookStore';
import { useSettingsStore } from '@/store/settingsStore';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { tauriRunCommand } from '@/services/ai/ask/runCommand';
import { fileSystemFromAppService } from '@/services/ai/history/historyStore';
import { getPersistentEchoStore, type EchoStore } from '@/services/echoes/echoStore';
import { continueEchoInChat, runEchoes } from '@/services/echoes/runEchoes';
import { findLibraryBookByCalibreId } from '@/services/echoes/resolveBook';
import type { EchoTrail } from '@/services/echoes/types';
import { eventDispatcher } from '@/utils/event';
import { navigateToReader } from '@/utils/nav';

type EchoesPanelProps = {
  bookKey: string;
};

function useEchoStore(): EchoStore | null {
  const { appService } = useEnv();
  return useMemo(() => {
    if (!appService) return null;
    try {
      return getPersistentEchoStore(fileSystemFromAppService(appService));
    } catch {
      return null;
    }
  }, [appService]);
}

const EchoesPanel: React.FC<EchoesPanelProps> = ({ bookKey }) => {
  const _ = useTranslation();
  const router = useAppRouter();
  const { envConfig } = useEnv();
  const echoStore = useEchoStore();
  const { settings } = useSettingsStore();
  const { getBookData, getConfig, updateBooknotes, saveConfig } = useBookDataStore();
  const { library } = useLibraryStore();
  const { setNotebookActiveTab } = useNotebookStore();
  const { createConversation, addMessage, setAgyConversationId } = useAIChatStore();
  const {
    activeEchoId,
    pendingSeed,
    isRunning,
    error,
    runToken,
    setActiveEchoId,
    setPendingSeed,
    setRunning,
    setError,
    requestEchoesRun,
    clearEchoesUi,
  } = useEchoesUiStore();

  const [trail, setTrail] = useState<EchoTrail | null>(null);
  const [composerQuestion, setComposerQuestion] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const lastRunTokenRef = useRef(0);

  const bookHash = bookKey.split('-')[0]!;
  const bookData = getBookData(bookKey);
  const bookTitle = bookData?.book?.title ?? '';
  const ai = settings.aiSettings ?? DEFAULT_AI_SETTINGS;

  const loadTrail = useCallback(
    async (id: string) => {
      if (!echoStore) return;
      const loaded = await echoStore.get(id);
      setTrail(loaded ?? null);
    },
    [echoStore],
  );

  useEffect(() => {
    if (activeEchoId) void loadTrail(activeEchoId);
  }, [activeEchoId, loadTrail]);

  useEffect(() => {
    if (!echoStore || !pendingSeed || runToken === lastRunTokenRef.current) return;
    lastRunTokenRef.current = runToken;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setRunning(true);
    setError(null);
    setTrail(null);

    void (async () => {
      try {
        const next = await runEchoes(
          pendingSeed,
          {
            lightragBaseUrl: ai.lightragBaseUrl || DEFAULT_AI_SETTINGS.lightragBaseUrl,
            lightragMode: ai.lightragMode || DEFAULT_AI_SETTINGS.lightragMode,
            agyPath: ai.agyPath || DEFAULT_AI_SETTINGS.agyPath,
          },
          {
            store: echoStore,
            runCommand: tauriRunCommand,
            abortSignal: controller.signal,
          },
        );
        if (controller.signal.aborted) return;
        setTrail(next);
        setActiveEchoId(next.id);
        setPendingSeed(null);
      } catch (e) {
        if (controller.signal.aborted) return;
        const message = e instanceof Error ? e.message : String(e);
        setError(message);
        eventDispatcher.dispatch('toast', {
          type: 'error',
          message: _('Could not find Echoes'),
          timeout: 4000,
        });
      } finally {
        if (!controller.signal.aborted) setRunning(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [
    _,
    ai.agyPath,
    ai.lightragBaseUrl,
    ai.lightragMode,
    echoStore,
    pendingSeed,
    runToken,
    setActiveEchoId,
    setError,
    setPendingSeed,
    setRunning,
  ]);

  const handleComposerSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const question = composerQuestion.trim();
    if (!question || isRunning) return;
    requestEchoesRun({
      bookHash,
      bookTitle,
      question,
    });
    setComposerQuestion('');
  };

  const handleSaveTrail = async () => {
    if (!echoStore || !trail) return;
    try {
      const { trail: promoted, note } = await echoStore.promote(trail.id);
      const booknotes = [...(getConfig(bookKey)?.booknotes ?? [])];
      const idx = booknotes.findIndex((n) => n.id === note.id);
      if (idx >= 0) booknotes[idx] = note;
      else booknotes.push(note);
      const updatedConfig = updateBooknotes(bookKey, booknotes);
      if (updatedConfig) await saveConfig(envConfig, bookKey, updatedConfig, settings);
      setTrail(promoted);
      setActiveEchoId(promoted.id);
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('Trail saved'),
        timeout: 2000,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    }
  };

  const handleDiscard = async () => {
    if (!echoStore || !trail) {
      clearEchoesUi();
      setTrail(null);
      return;
    }
    if (trail.status === 'draft') {
      await echoStore.delete(trail.id);
    }
    clearEchoesUi();
    setTrail(null);
  };

  const handleContinueInChat = async () => {
    if (!trail) return;
    await continueEchoInChat(trail, {
      createConversation,
      addMessage,
      setAgyConversationId,
    });
    setNotebookActiveTab('ai');
  };

  const handleOpenSource = (bookId?: string) => {
    const book = findLibraryBookByCalibreId(library, bookId);
    if (!book) {
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('Book not found in library'),
        timeout: 2500,
      });
      return;
    }
    navigateToReader(router, [book.hash]);
  };

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3 px-3 pb-2'>
      <form onSubmit={handleComposerSubmit} className='shrink-0'>
        <label className='sr-only' htmlFor='echoes-composer'>
          {_('Ask across your library')}
        </label>
        <div className='flex gap-2'>
          <input
            id='echoes-composer'
            type='text'
            value={composerQuestion}
            onChange={(e) => setComposerQuestion(e.target.value)}
            placeholder={_('Ask across your library…')}
            disabled={isRunning}
            className='eink-bordered border-base-300 bg-base-100 focus:border-base-content/40 min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm outline-none'
          />
          <button
            type='submit'
            disabled={isRunning || !composerQuestion.trim()}
            className='btn btn-contrast h-auto min-h-0 px-3 py-2 text-sm'
          >
            {_('Find')}
          </button>
        </div>
      </form>

      {isRunning && (
        <p className='text-base-content/70 text-sm' role='status'>
          {_('Finding echoes…')}
        </p>
      )}

      {error && !isRunning && (
        <p className='text-error text-sm' role='alert'>
          {error}
        </p>
      )}

      {!trail && !isRunning && !error && (
        <div className='text-base-content/60 flex flex-1 flex-col justify-center gap-2 text-sm'>
          <p>{_('Select a passage and choose Find Echoes, or ask a question above.')}</p>
          <p className='text-xs opacity-80'>
            {_('Echoes compares ideas across your indexed library — not a chat thread.')}
          </p>
        </div>
      )}

      {trail && (
        <div className='eink-bordered border-base-300 bg-base-100 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border p-3'>
          <div className='flex items-center justify-between gap-2'>
            <span className='text-xs font-medium uppercase tracking-wide opacity-70'>
              {trail.status === 'promoted' ? _('Saved trail') : _('Draft')}
            </span>
          </div>

          {(trail.seed.seedText || trail.seed.question) && (
            <section aria-labelledby='echoes-seed-heading'>
              <h2 id='echoes-seed-heading' className='mb-1 text-xs font-medium opacity-70'>
                {_('Seed')}
              </h2>
              {trail.seed.question && (
                <p className='mb-1 text-sm font-medium'>{trail.seed.question}</p>
              )}
              {trail.seed.seedText && (
                <blockquote className='border-base-content/20 border-s-2 ps-3 text-sm italic opacity-90'>
                  {trail.seed.seedText}
                </blockquote>
              )}
            </section>
          )}

          <section aria-labelledby='echoes-synthesis-heading'>
            <h2 id='echoes-synthesis-heading' className='mb-1 text-xs font-medium opacity-70'>
              {_('Comparative take')}
            </h2>
            <p className='whitespace-pre-wrap text-sm leading-relaxed'>{trail.synthesis}</p>
          </section>

          <section aria-labelledby='echoes-sources-heading'>
            <h2 id='echoes-sources-heading' className='mb-2 text-xs font-medium opacity-70'>
              {_('Sources')}
            </h2>
            {trail.sources.length === 0 ? (
              <p className='text-sm opacity-70'>{_('No library sources')}</p>
            ) : (
              <ul className='flex flex-col gap-2'>
                {trail.sources.map((source) => (
                  <li
                    key={source.id}
                    className='eink-bordered border-base-300 rounded-md border px-2 py-2 text-sm'
                  >
                    <div className='flex items-start justify-between gap-2'>
                      <div className='min-w-0'>
                        <p className='font-medium'>
                          [{source.id}] {source.bookTitle || source.title}
                        </p>
                        <p className='text-base-content/70 line-clamp-3 text-xs'>
                          {source.snippet}
                        </p>
                      </div>
                      <button
                        type='button'
                        className='btn btn-ghost h-8 min-h-8 shrink-0 px-2 text-xs'
                        onClick={() => handleOpenSource(source.bookId)}
                        disabled={!source.bookId}
                      >
                        {_('Open')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className='mt-auto flex flex-wrap justify-end gap-2 pt-1' dir='ltr'>
            <button
              type='button'
              className='eink-bordered btn btn-ghost h-8 min-h-8 px-3'
              onClick={() => void handleDiscard()}
            >
              {_('Discard')}
            </button>
            <button
              type='button'
              className='eink-bordered btn btn-ghost h-8 min-h-8 px-3'
              onClick={() => void handleContinueInChat()}
            >
              {_('Continue in chat')}
            </button>
            <button
              type='button'
              className='btn btn-contrast h-8 min-h-8 px-3'
              onClick={() => void handleSaveTrail()}
              disabled={trail.status === 'promoted'}
            >
              {_('Save trail')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EchoesPanel;
