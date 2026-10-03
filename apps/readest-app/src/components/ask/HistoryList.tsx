'use client';

import clsx from 'clsx';
import dayjs from 'dayjs';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuMessageSquare, LuTrash2 } from 'react-icons/lu';

import Dialog from '@/components/Dialog';
import { SourceChips } from '@/components/ask/SourceChips';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import {
  createPersistentHistoryStore,
  type HistoryStore,
} from '@/services/ai/history/historyStore';
import type { QAMessage, QAThread } from '@/services/ai/history/types';
import { debounce } from '@/utils/debounce';

export type HistoryListProps = {
  /** Resolve whether the book still exists in the library. */
  resolveBookPresent: (bookHash: string) => boolean;
  /** Open the book in the reader and restore this thread. */
  onOpenThread: (thread: QAThread) => void;
};

const HistoryList: React.FC<HistoryListProps> = ({ resolveBookPresent, onOpenThread }) => {
  const _ = useTranslation();
  const { appService } = useEnv();

  const [query, setQuery] = useState('');
  const [threads, setThreads] = useState<QAThread[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingTranscript, setMissingTranscript] = useState<{
    thread: QAThread;
    messages: QAMessage[];
  } | null>(null);

  const storeRef = useRef<HistoryStore | null>(null);

  const getStore = useCallback((): HistoryStore | null => {
    if (!appService) return null;
    if (!storeRef.current) {
      storeRef.current = createPersistentHistoryStore(appService.fs);
    }
    return storeRef.current;
  }, [appService]);

  const refresh = useCallback(
    async (searchQuery: string) => {
      const store = getStore();
      if (!store) return;
      setLoading(true);
      try {
        const trimmed = searchQuery.trim();
        const next = trimmed ? await store.searchThreads(trimmed) : await store.listRecent(100);
        setThreads(next);
      } finally {
        setLoading(false);
      }
    },
    [getStore],
  );

  const debouncedSearch = useMemo(
    () =>
      debounce((value: string) => {
        void refresh(value);
      }, 200),
    [refresh],
  );

  useEffect(() => {
    void refresh('');
  }, [refresh]);

  useEffect(() => {
    return () => {
      debouncedSearch.cancel();
    };
  }, [debouncedSearch]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    debouncedSearch(value);
  };

  const handleOpen = async (thread: QAThread) => {
    if (!resolveBookPresent(thread.bookHash)) {
      const store = getStore();
      const messages = store ? await store.getMessages(thread.id) : [];
      setMissingTranscript({ thread, messages });
      return;
    }
    onOpenThread(thread);
  };

  const handleDelete = async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    const store = getStore();
    if (!store || !appService) return;
    if (!(await appService.ask(_('Delete this question thread?')))) return;
    await store.deleteThread(threadId);
    await refresh(query);
  };

  const handleClearAll = async () => {
    const store = getStore();
    if (!store || !appService) return;
    const recent = await store.listRecent(1);
    if (recent.length === 0) return;
    if (!(await appService.ask(_('Clear all question history? This cannot be undone.')))) return;
    await store.clearAll();
    setThreads([]);
    setQuery('');
  };

  return (
    <div className='flex h-full min-h-0 flex-1 flex-col'>
      <div className='flex shrink-0 items-center gap-2 px-4 py-3'>
        <input
          type='search'
          className='input input-bordered input-sm min-w-0 flex-1'
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder={_('Search questions…')}
          aria-label={_('Search questions')}
        />
        <button
          type='button'
          className='btn btn-ghost btn-sm text-error'
          disabled={loading}
          onClick={() => void handleClearAll()}
        >
          {_('Clear all')}
        </button>
      </div>

      <div className='min-h-0 flex-1 overflow-y-auto'>
        {loading ? (
          <div className='flex h-40 items-center justify-center'>
            <div className='border-primary size-5 animate-spin rounded-full border-2 border-t-transparent' />
          </div>
        ) : threads.length === 0 ? (
          <div className='flex h-40 flex-col items-center justify-center gap-2 px-4 text-center'>
            <div className='bg-base-300/50 rounded-full p-3'>
              <LuMessageSquare className='text-base-content/50 size-6' />
            </div>
            <p className='text-base-content/70 text-sm'>
              {query.trim() ? _('No matching questions') : _('No questions yet')}
            </p>
          </div>
        ) : (
          <ul className='divide-base-300/30 divide-y'>
            {threads.map((thread) => (
              <li key={thread.id}>
                <div
                  className={clsx(
                    'group flex cursor-pointer items-start gap-2 px-4 py-3',
                    'hover:bg-base-300/50 transition-colors duration-150',
                  )}
                  role='button'
                  tabIndex={0}
                  onClick={() => void handleOpen(thread)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void handleOpen(thread);
                    }
                  }}
                >
                  <div className='min-w-0 flex-1'>
                    <p className='text-base-content line-clamp-2 text-sm font-medium'>
                      {thread.title}
                    </p>
                    <div className='text-base-content/50 mt-1 flex flex-wrap items-center gap-2 text-xs'>
                      <span className='line-clamp-1'>{thread.bookTitle}</span>
                      <span aria-hidden='true'>·</span>
                      <span>{dayjs(thread.updatedAt).fromNow()}</span>
                      {thread.grounded ? (
                        <span className='badge badge-outline badge-xs'>{_('Library')}</span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type='button'
                    className='btn btn-ghost btn-xs text-error shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100'
                    aria-label={_('Delete')}
                    onClick={(e) => void handleDelete(e, thread.id)}
                  >
                    <LuTrash2 size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        isOpen={!!missingTranscript}
        title={missingTranscript?.thread.title || _('Questions')}
        onClose={() => setMissingTranscript(null)}
        boxClassName='sm:min-w-[32rem] sm:max-w-xl'
        contentClassName='flex min-h-0 flex-1 flex-col'
      >
        {missingTranscript ? (
          <div className='flex min-h-[16rem] flex-1 flex-col'>
            <p className='text-warning px-4 pt-3 text-sm'>{_('Book file not found')}</p>
            <p className='text-base-content/50 px-4 pt-1 text-xs'>
              {missingTranscript.thread.bookTitle}
            </p>
            <div className='flex-1 space-y-3 overflow-y-auto px-4 py-3'>
              {missingTranscript.messages.map((m) => (
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
                  {m.role === 'assistant' && m.sources?.length ? (
                    <div className='mt-2'>
                      <SourceChips sources={m.sources} />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
};

export default HistoryList;
