'use client';

import React, { useEffect, useRef, useState } from 'react';
import Dialog from '@/components/Dialog';
import { SourceChips } from '@/components/ask/SourceChips';
import { mapAskError } from '@/components/ask/askErrors';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { eventDispatcher } from '@/utils/event';
import { uniqueId } from '@/utils/misc';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import { runAsk, runFollowUp, type AskDeps } from '@/services/ai/ask/askService';
import { completeWithAntigravity } from '@/services/ai/ask/antigravityClient';
import { tauriRunCommand } from '@/services/ai/ask/runCommand';
import type { AskMode } from '@/services/ai/ask/types';
import {
  createPersistentHistoryStore,
  type HistoryStore,
  type SaveTurnInput,
} from '@/services/ai/history/historyStore';
import { retrieveFromLightRAG } from '@/services/ai/lightrag/client';
import type { LightRAGSource } from '@/services/ai/lightrag/types';

export type AskPanelMessage = {
  id: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  sources?: LightRAGSource[];
  grounded?: boolean;
  offerAskWithoutLibrary?: boolean;
};

export type AskPanelRestore = {
  threadId: string;
  messages: AskPanelMessage[];
  agyConversationId?: string;
  selectionText?: string;
  selectionCfi?: string;
  grounded?: boolean;
};

export type AskPanelProps = {
  open: boolean;
  onClose: () => void;
  bookHash: string;
  bookTitle: string;
  selectionText: string;
  selectionCfi?: string;
  /** Mode for the opening Ask turn (new highlight always starts a new thread). */
  mode: AskMode;
  /** First question from AskComposer; triggers runAsk when the panel opens. */
  initialQuestion: string;
  /** Bumps whenever Annotator starts a fresh Ask from a new highlight. */
  threadEpoch: number;
  /**
   * When set (with a matching threadEpoch bump), load prior messages instead of
   * running a new Ask — used by global Questions history jump-to-book.
   */
  restore?: AskPanelRestore | null;
};

function buildAskDeps(ai: {
  agyPath?: string;
  lightragBaseUrl?: string;
  lightragMode?: string;
}): AskDeps {
  return {
    retrieve: retrieveFromLightRAG,
    complete: completeWithAntigravity,
    runCommand: tauriRunCommand,
    agyPath: ai.agyPath ?? DEFAULT_AI_SETTINGS.agyPath,
    lightragBaseUrl: ai.lightragBaseUrl ?? DEFAULT_AI_SETTINGS.lightragBaseUrl,
    lightragMode: ai.lightragMode ?? DEFAULT_AI_SETTINGS.lightragMode,
  };
}

export function rebuildFollowUpQuestion(messages: AskPanelMessage[], followUp: string): string {
  const prior = messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');
  if (!prior) return followUp;
  return `${prior}\n\nUser follow-up: ${followUp}`;
}

const AskPanel: React.FC<AskPanelProps> = ({
  open,
  onClose,
  bookHash,
  bookTitle,
  selectionText,
  selectionCfi,
  mode,
  initialQuestion,
  threadEpoch,
  restore = null,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { settings } = useSettingsStore();
  const aiSettings = settings?.aiSettings ?? DEFAULT_AI_SETTINGS;

  const [messages, setMessages] = useState<AskPanelMessage[]>([]);
  const [agyConversationId, setAgyConversationId] = useState<string | undefined>();
  const [activeThreadId, setActiveThreadId] = useState<string | undefined>();
  const [activeMode, setActiveMode] = useState<AskMode>(mode);
  const [followUp, setFollowUp] = useState('');
  const [busy, setBusy] = useState(false);
  const [displaySelectionText, setDisplaySelectionText] = useState(selectionText);
  const [displaySelectionCfi, setDisplaySelectionCfi] = useState(selectionCfi);
  const listRef = useRef<HTMLDivElement>(null);
  const startedEpochRef = useRef<number | null>(null);
  const historyStoreRef = useRef<HistoryStore | null>(null);
  const activeThreadIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  const getHistoryStore = (): HistoryStore | null => {
    if (!appService) return null;
    if (!historyStoreRef.current) {
      historyStoreRef.current = createPersistentHistoryStore(appService.fs);
    }
    return historyStoreRef.current;
  };

  /** Persist a finalized turn; write failures must not hide the answer. */
  const persistTurn = async (
    input: Omit<SaveTurnInput, 'bookHash' | 'bookTitle' | 'threadId'> & {
      threadId?: string;
    },
  ) => {
    const store = getHistoryStore();
    if (!store) return;
    try {
      const thread = await store.saveTurn({
        bookHash,
        bookTitle,
        ...input,
        threadId: input.threadId ?? activeThreadIdRef.current,
      });
      setActiveThreadId(thread.id);
      activeThreadIdRef.current = thread.id;
    } catch (err) {
      console.warn('Failed to persist Ask history:', err);
      eventDispatcher.dispatch('toast', {
        type: 'warning',
        message: _('Could not save question history.'),
        timeout: 3000,
      });
    }
  };

  const scrollToBottom = () => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  };

  useEffect(() => {
    if (!open) return;
    scrollToBottom();
  }, [messages, open, busy]);

  const appendError = (
    err: unknown,
    opts?: { offerAskWithoutLibrary?: boolean; question?: string },
  ) => {
    const info = mapAskError(err);
    setMessages((prev) => [
      ...prev,
      {
        id: uniqueId(),
        role: 'error',
        content: info.message,
        offerAskWithoutLibrary: opts?.offerAskWithoutLibrary ?? info.offerAskWithoutLibrary,
      },
    ]);
    if (opts?.question) {
      void persistTurn({
        question: opts.question,
        answer: info.message,
        selectionText: displaySelectionText,
        selectionCfi: displaySelectionCfi,
        sources: [],
        grounded: false,
        isError: true,
      });
    }
  };

  const runInitialAsk = async (question: string, askMode: AskMode) => {
    const deps = buildAskDeps(aiSettings);
    setBusy(true);
    setMessages([
      {
        id: uniqueId(),
        role: 'user',
        content: question,
        grounded: askMode === 'ask-with-library',
      },
    ]);
    try {
      const result = await runAsk(
        {
          mode: askMode,
          bookHash,
          bookTitle,
          selectionText: displaySelectionText,
          selectionCfi: displaySelectionCfi,
          question,
        },
        deps,
      );
      setAgyConversationId(result.agyConversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: uniqueId(),
          role: 'assistant',
          content: result.answer,
          sources: result.sources,
          grounded: result.grounded,
        },
      ]);
      void persistTurn({
        question,
        answer: result.answer,
        selectionText: displaySelectionText,
        selectionCfi: displaySelectionCfi,
        sources: result.sources,
        grounded: result.grounded,
        agyConversationId: result.agyConversationId,
      });
    } catch (err) {
      appendError(err, { question });
    } finally {
      setBusy(false);
    }
  };

  // New highlight Ask / Ask with library always starts a new thread.
  // Restored history threads load prior messages without re-running Ask.
  useEffect(() => {
    if (!open) return;
    if (startedEpochRef.current === threadEpoch) return;
    startedEpochRef.current = threadEpoch;
    setFollowUp('');

    if (restore?.threadId) {
      setActiveMode(restore.grounded ? 'ask-with-library' : 'ask');
      setDisplaySelectionText(restore.selectionText ?? '');
      setDisplaySelectionCfi(restore.selectionCfi);
      setAgyConversationId(restore.agyConversationId);
      setActiveThreadId(restore.threadId);
      activeThreadIdRef.current = restore.threadId;
      setMessages(restore.messages);
      setBusy(false);
      return;
    }

    if (!initialQuestion.trim()) return;
    setDisplaySelectionText(selectionText);
    setDisplaySelectionCfi(selectionCfi);
    setAgyConversationId(undefined);
    setActiveThreadId(undefined);
    activeThreadIdRef.current = undefined;
    setActiveMode(mode);
    void runInitialAsk(initialQuestion.trim(), mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, threadEpoch, initialQuestion, mode, restore]);

  const handleAskWithoutLibrary = (errorMessageId: string) => {
    const userMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (!userMsg) return;
    setMessages((prev) => prev.filter((m) => m.id !== errorMessageId));
    setActiveMode('ask');
    setAgyConversationId(undefined);
    setActiveThreadId(undefined);
    activeThreadIdRef.current = undefined;
    void runInitialAsk(userMsg.content, 'ask');
  };

  const handleFollowUp = async (event: React.FormEvent) => {
    event.preventDefault();
    const question = followUp.trim();
    if (!question || busy) return;
    setFollowUp('');
    const userTurn: AskPanelMessage = { id: uniqueId(), role: 'user', content: question };
    setMessages((prev) => [...prev, userTurn]);
    setBusy(true);
    const deps = buildAskDeps(aiSettings);

    try {
      if (agyConversationId) {
        try {
          const result = await runFollowUp({ question, agyConversationId }, deps);
          setAgyConversationId(result.agyConversationId);
          setMessages((prev) => [
            ...prev,
            {
              id: uniqueId(),
              role: 'assistant',
              content: result.answer,
              sources: result.sources,
              grounded: result.grounded,
            },
          ]);
          void persistTurn({
            question,
            answer: result.answer,
            selectionText: displaySelectionText,
            selectionCfi: displaySelectionCfi,
            sources: result.sources,
            grounded: result.grounded,
            agyConversationId: result.agyConversationId,
          });
          return;
        } catch (resumeErr) {
          eventDispatcher.dispatch('toast', {
            type: 'warning',
            message: _('Follow-up resume failed; rebuilding from prior messages.'),
            timeout: 4000,
          });
          const rebuilt = rebuildFollowUpQuestion([...messages, userTurn], question);
          const result = await runAsk(
            {
              mode: 'ask',
              bookHash,
              bookTitle,
              selectionText: displaySelectionText,
              selectionCfi: displaySelectionCfi,
              question: rebuilt,
            },
            deps,
          );
          setAgyConversationId(result.agyConversationId);
          setMessages((prev) => [
            ...prev,
            {
              id: uniqueId(),
              role: 'assistant',
              content: result.answer,
              sources: result.sources,
              grounded: false,
            },
          ]);
          void persistTurn({
            question,
            answer: result.answer,
            selectionText: displaySelectionText,
            selectionCfi: displaySelectionCfi,
            sources: result.sources,
            grounded: false,
            agyConversationId: result.agyConversationId,
          });
          return;
        }
      }

      // Rare: no conversation id — rebuild prior turns into one-shot Ask
      // (same shape as the resume-failure path above).
      const rebuilt = rebuildFollowUpQuestion([...messages, userTurn], question);
      const result = await runAsk(
        {
          mode: activeMode === 'ask-with-library' ? 'ask' : activeMode,
          bookHash,
          bookTitle,
          selectionText: displaySelectionText,
          selectionCfi: displaySelectionCfi,
          question: rebuilt,
        },
        deps,
      );
      setAgyConversationId(result.agyConversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: uniqueId(),
          role: 'assistant',
          content: result.answer,
          sources: result.sources,
          grounded: result.grounded,
        },
      ]);
      void persistTurn({
        question,
        answer: result.answer,
        selectionText: displaySelectionText,
        selectionCfi: displaySelectionCfi,
        sources: result.sources,
        grounded: result.grounded,
        agyConversationId: result.agyConversationId,
      });
    } catch (err) {
      appendError(err, { question });
    } finally {
      setBusy(false);
    }
  };

  const title = activeMode === 'ask-with-library' ? _('Ask with library') : _('Ask');

  return (
    <Dialog
      isOpen={open}
      title={title}
      onClose={onClose}
      boxClassName='sm:min-w-[32rem] sm:max-w-xl'
      contentClassName='flex min-h-0 flex-1 flex-col'
      aboveKeyboard
    >
      {open && (
        <div className='flex min-h-[20rem] flex-1 flex-col'>
          <div ref={listRef} className='flex-1 space-y-3 overflow-y-auto px-4 py-3'>
            {displaySelectionText ? (
              <blockquote className='border-base-content/20 border-l-2 pl-3 text-xs opacity-70'>
                {displaySelectionText.length > 200
                  ? `${displaySelectionText.slice(0, 200).trimEnd()}…`
                  : displaySelectionText}
              </blockquote>
            ) : null}
            {messages.map((m) => (
              <div
                key={m.id}
                className={
                  m.role === 'user'
                    ? 'ml-6 rounded-lg bg-base-200 px-3 py-2 text-sm'
                    : m.role === 'error'
                      ? 'rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm'
                      : 'mr-6 rounded-lg bg-base-100 px-3 py-2 text-sm'
                }
              >
                <p className='whitespace-pre-wrap'>{m.content}</p>
                {m.role === 'assistant' && m.grounded ? (
                  <div className='mt-2'>
                    <SourceChips sources={m.sources ?? []} />
                  </div>
                ) : null}
                {m.role === 'error' && m.offerAskWithoutLibrary ? (
                  <button
                    type='button'
                    className='btn btn-outline btn-xs mt-2'
                    disabled={busy}
                    onClick={() => handleAskWithoutLibrary(m.id)}
                  >
                    {_('Ask without library')}
                  </button>
                ) : null}
              </div>
            ))}
            {busy ? <p className='text-base-content/60 text-sm italic'>{_('Thinking…')}</p> : null}
          </div>
          <form
            className='border-base-300 flex shrink-0 gap-2 border-t px-4 py-3'
            onSubmit={handleFollowUp}
          >
            <input
              className='input input-bordered input-sm min-w-0 flex-1'
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              placeholder={_('Ask a follow-up…')}
              disabled={busy}
            />
            <button
              type='submit'
              className='btn btn-primary btn-sm'
              disabled={busy || !followUp.trim()}
            >
              {_('Send')}
            </button>
          </form>
        </div>
      )}
    </Dialog>
  );
};

export default AskPanel;
