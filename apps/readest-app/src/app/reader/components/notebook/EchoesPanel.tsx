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
import { fileSystemFromAppService } from '@/services/ai/fileSystemFromAppService';
import { EchoConnectionList } from '@/components/echoes/EchoConnectionList';
import { EchoIdeaChips } from '@/components/echoes/EchoIdeaChips';
import { EchoSourceCard } from '@/components/echoes/EchoSourceCard';
import { getPersistentEchoStore, type EchoStore } from '@/services/echoes/echoStore';
import { findLatestTrailForBook, planOpenEchoBook } from '@/services/echoes/openEchoBook';
import { EchoesDeferredError } from '@/services/echoes/EchoesDeferredError';
import { continueEchoInChat, runEchoes } from '@/services/echoes/runEchoes';
import { findLibraryBookByCalibreId } from '@/services/echoes/resolveBook';
import type { EchoTrail } from '@/services/echoes/types';
import { useReaderStore } from '@/store/readerStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { useSaveBooknoteNoteText } from '../../hooks/useSaveBooknoteNoteText';
import {
  removeBookNoteOverlays,
  removeEmptyAnnotationPlaceholder,
} from '../../utils/annotatorUtil';
import { eventDispatcher } from '@/utils/event';
import { focusExistingReaderWindow, navigateToReader } from '@/utils/nav';
import { emitTo } from '@tauri-apps/api/event';

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
  const { getConfig, updateBooknotes, saveConfig } = useBookDataStore();
  const getViewsById = useReaderStore((s) => s.getViewsById);
  const { library } = useLibraryStore();
  const { setNotebookActiveTab } = useNotebookStore();
  const { createConversation, addMessage, setAgyConversationId } = useAIChatStore();
  const saveBooknoteNoteText = useSaveBooknoteNoteText(bookKey);
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
  } = useEchoesUiStore();

  const [trail, setTrail] = useState<EchoTrail | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastRunTokenRef = useRef(0);
  /** Prevents re-restoring after selection is cleared for this book. */
  const restoredForBookRef = useRef<string | null>(null);

  const bookHash = bookKey.split('-')[0]!;
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
    if (activeEchoId) {
      restoredForBookRef.current = bookHash;
      void loadTrail(activeEchoId);
      return;
    }

    // Session selection is in-memory; after close/reopen, rehydrate the latest
    // trail for this book from the durable store (prefer promoted).
    if (!echoStore || pendingSeed || isRunning) return;
    if (restoredForBookRef.current === bookHash) return;

    let cancelled = false;
    void (async () => {
      const trails = await echoStore.list();
      if (cancelled) return;
      restoredForBookRef.current = bookHash;
      const ui = useEchoesUiStore.getState();
      if (ui.activeEchoId || ui.pendingSeed) return;
      const latest = findLatestTrailForBook(trails, bookHash);
      if (latest) setActiveEchoId(latest.id);
    })();

    return () => {
      cancelled = true;
    };
  }, [activeEchoId, bookHash, echoStore, isRunning, loadTrail, pendingSeed, setActiveEchoId]);

  useEffect(() => {
    if (!echoStore || !pendingSeed || runToken === lastRunTokenRef.current) return;
    lastRunTokenRef.current = runToken;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Capture before any clear so catch/finally still have annotation ids.
    const seed = pendingSeed;
    const annotationId = seed.annotationId;
    const annotationIsNew = seed.annotationIsNew;

    setRunning(true);
    setError(null);
    setTrail(null);

    void (async () => {
      try {
        const next = await runEchoes(
          seed,
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
        const noteId = next.noteId ?? annotationId;
        if (noteId) {
          await saveBooknoteNoteText(noteId, next.synthesis, { contribution: 'ai' });
        }
        if (controller.signal.aborted) return;
        setTrail(next);
        setActiveEchoId(next.id);
        setPendingSeed(null);
      } catch (e) {
        if (controller.signal.aborted) return;
        // Clear so a remount (same runToken) does not re-fire runEchoes.
        setPendingSeed(null);
        const deferred =
          e instanceof EchoesDeferredError ||
          (typeof e === 'object' &&
            e !== null &&
            'code' in e &&
            (e as { code?: unknown }).code === 'echoes_deferred');
        if (deferred) {
          setError(null);
          eventDispatcher.dispatch('toast', {
            type: 'info',
            message: _('Nothing in your library points this direction'),
            timeout: 4000,
          });
        } else {
          const message = e instanceof Error ? e.message : String(e);
          setError(message);
          eventDispatcher.dispatch('toast', {
            type: 'error',
            message: _('Could not find Echoes'),
            timeout: 4000,
          });
        }
        if (annotationIsNew && annotationId) {
          const { booknotes = [] } = getConfig(bookKey) ?? {};
          const removed = removeEmptyAnnotationPlaceholder(booknotes, annotationId, Date.now());
          if (removed) {
            const views = getViewsById(bookKey.split('-')[0]!);
            views.forEach((view) => removeBookNoteOverlays(view, removed));
            const updatedConfig = updateBooknotes(bookKey, booknotes);
            if (updatedConfig) {
              const latestSettings = useSettingsStore.getState().settings;
              await saveConfig(envConfig, bookKey, updatedConfig, latestSettings);
            }
          }
        }
      } finally {
        if (!controller.signal.aborted) setRunning(false);
      }
    })();

    return () => {
      controller.abort();
      // React Strict Mode remounts with the same token; clear the guard so the
      // remounted effect can start the run again.
      if (lastRunTokenRef.current === runToken) {
        lastRunTokenRef.current = 0;
      }
    };
  }, [
    _,
    ai.agyPath,
    ai.lightragBaseUrl,
    ai.lightragMode,
    bookKey,
    echoStore,
    envConfig,
    getConfig,
    getViewsById,
    pendingSeed,
    runToken,
    saveBooknoteNoteText,
    saveConfig,
    setActiveEchoId,
    setError,
    setPendingSeed,
    setRunning,
    updateBooknotes,
  ]);

  const handleContinueInChat = async () => {
    if (!trail) return;
    await continueEchoInChat(trail, {
      createConversation,
      addMessage,
      setAgyConversationId,
    });
    setNotebookActiveTab('ai');
  };

  const handleOpenSource = (bookId?: string | number) => {
    const book = findLibraryBookByCalibreId(library, bookId);
    if (!book) {
      eventDispatcher.dispatch('toast', {
        type: 'info',
        message: _('Book not found in library'),
        timeout: 2500,
      });
      return;
    }

    void (async () => {
      const readerMounted =
        typeof window !== 'undefined' && window.location.pathname.startsWith('/reader');
      const plan = planOpenEchoBook({
        bookHash: book.hash,
        bookKeys: useReaderStore.getState().bookKeys,
        readerMounted,
      });

      if (plan.action === 'focus-existing') {
        useSidebarStore.getState().setSideBarBookKey(plan.bookKey);
        return;
      }

      // Book already open in another Tauri reader window — focus that, don't
      // replace this window's books or spawn a third copy.
      const existingLabel = await focusExistingReaderWindow(book.hash);
      if (existingLabel) {
        await emitTo(existingLabel, 'reader-open-echo', { bookHash: book.hash });
        return;
      }

      if (plan.action === 'switch-in-reader') {
        eventDispatcher.dispatch('open-book-in-reader', { bookHash: plan.bookHash });
        return;
      }
      navigateToReader(router, [book.hash]);
    })();
  };

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3 px-3 pb-2'>
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
          <p>{_('Select a passage and choose Find Echoes.')}</p>
          <p className='text-xs opacity-80'>
            {_('Echoes compares ideas across your indexed library — not a chat thread.')}
          </p>
        </div>
      )}

      {trail && (
        <div className='eink-bordered border-base-300 bg-base-100 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto rounded-lg border p-3'>
          <section aria-labelledby='echoes-synthesis-heading'>
            <h2 id='echoes-synthesis-heading' className='mb-1 text-xs font-medium opacity-70'>
              {_('Comparative take')}
            </h2>
            <p className='whitespace-pre-wrap text-sm leading-relaxed'>{trail.synthesis}</p>
          </section>

          {(trail.ideas?.length ?? 0) > 0 && (
            <section aria-labelledby='echoes-ideas-heading'>
              <h2 id='echoes-ideas-heading' className='mb-2 text-xs font-medium opacity-70'>
                {_('Ideas')}
              </h2>
              <EchoIdeaChips ideas={trail.ideas!} />
            </section>
          )}

          {(trail.connections?.length ?? 0) > 0 && (
            <section aria-labelledby='echoes-connections-heading'>
              <h2 id='echoes-connections-heading' className='mb-2 text-xs font-medium opacity-70'>
                {_('Connections')}
              </h2>
              <EchoConnectionList connections={trail.connections!} />
            </section>
          )}

          <section aria-labelledby='echoes-sources-heading'>
            <h2 id='echoes-sources-heading' className='mb-2 text-xs font-medium opacity-70'>
              {_('Sources')}
            </h2>
            {trail.sources.length === 0 ? (
              <p className='text-sm opacity-70'>{_('No library sources')}</p>
            ) : (
              <ul className='flex flex-col gap-2'>
                {trail.sources.map((source) => (
                  <EchoSourceCard
                    key={source.id}
                    source={source}
                    passages={trail.passages}
                    onOpen={handleOpenSource}
                    openDisabled={!source.bookId}
                  />
                ))}
              </ul>
            )}
          </section>

          {trail.trace ? (
            <section aria-labelledby='echoes-trace-heading'>
              <details className='eink-bordered border-base-300 rounded border px-2 py-1.5'>
                <summary
                  id='echoes-trace-heading'
                  className='cursor-pointer text-xs font-medium opacity-70'
                >
                  {_('Trace')}
                </summary>
                <div className='mt-2 flex flex-col gap-1.5 text-xs leading-snug'>
                  <p>
                    <span className='opacity-60'>{_('Query')}: </span>
                    {trail.trace.query}
                  </p>
                  {trail.trace.deferred ? (
                    <p className='opacity-80'>{_('Deferred — nothing above threshold')}</p>
                  ) : null}
                  {trail.trace.retrieved.length > 0 ? (
                    <ul className='flex flex-col gap-0.5'>
                      {trail.trace.retrieved.map((entry) => (
                        <li key={entry.id} className='truncate'>
                          {entry.title || entry.bookTitle || entry.id}
                          {entry.score != null ? ` (${entry.score.toFixed(2)})` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {trail.trace.dropped.length > 0 ? (
                    <p className='opacity-60'>
                      {_('Dropped {{count}} below threshold', {
                        count: trail.trace.dropped.length,
                      })}
                    </p>
                  ) : null}
                </div>
              </details>
            </section>
          ) : null}

          <div className='mt-auto flex flex-wrap justify-end gap-2 pt-1' dir='ltr'>
            <button
              type='button'
              className='eink-bordered btn btn-ghost h-8 min-h-8 px-3'
              onClick={() => void handleContinueInChat()}
            >
              {_('Continue in chat')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EchoesPanel;
