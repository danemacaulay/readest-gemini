'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  useAssistantRuntime,
  type ThreadMessage,
  type ThreadHistoryAdapter,
} from '@assistant-ui/react';

import { useTranslation } from '@/hooks/useTranslation';
import { useSettingsStore } from '@/store/settingsStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useReaderStore } from '@/store/readerStore';
import { useBookProgress } from '@/store/readerProgressStore';
import { useAIChatStore } from '@/store/aiChatStore';
import { aiLogger, createTauriAdapter } from '@/services/ai';
import {
  createAntigravityChatAdapter,
  LegacyIdbBackend,
  ReedyBackend,
  ReedySourceStore,
  selectBackend,
  type RetrievalBackend,
  type SourceItem,
} from '@/services/ai/adapters';
import type { BookContextInput } from '@/services/ai/adapters/bookContext';
import { tauriRunCommand } from '@/services/ai/ask/runCommand';
import type { EmbeddingProgress, AISettings, AIMessage } from '@/services/ai/types';
import type { RetrievedChunk } from '@/services/reedy/retrieval/BookRetriever';
import { useEnv } from '@/context/EnvContext';
import { isTauriAppPlatform } from '@/services/environment';
import type { AppService } from '@/types/system';
import type { ChatModelAdapter } from '@assistant-ui/react';
import {
  formatDescription,
  formatPublisher,
  getContributorNames,
  getSeriesIndex,
} from '@/utils/book';

import { Button } from '@/components/ui/button';
import { Loader2Icon, BookOpenIcon } from 'lucide-react';
import { Thread } from '@/components/assistant/Thread';

// Helper function to convert AIMessage array to ExportedMessageRepository format
// Each message needs to be wrapped with { message, parentId } structure
function convertToExportedMessages(
  aiMessages: AIMessage[],
): { message: ThreadMessage; parentId: string | null }[] {
  return aiMessages.map((msg, idx) => {
    const baseMessage = {
      id: msg.id,
      content: [{ type: 'text' as const, text: msg.content }],
      createdAt: new Date(msg.createdAt),
      metadata: { custom: {} },
    };

    // Build role-specific message to satisfy ThreadMessage union type
    const threadMessage: ThreadMessage =
      msg.role === 'user'
        ? ({
            ...baseMessage,
            role: 'user' as const,
            attachments: [] as const,
          } as unknown as ThreadMessage)
        : ({
            ...baseMessage,
            role: 'assistant' as const,
            status: { type: 'complete' as const, reason: 'stop' as const },
          } as unknown as ThreadMessage);

    return {
      message: threadMessage,
      parentId: idx > 0 ? (aiMessages[idx - 1]?.id ?? null) : null,
    };
  });
}

interface AIAssistantProps {
  bookKey: string;
}

function useThreadHistoryAdapter() {
  const {
    activeConversationId,
    messages: storedMessages,
    addMessage,
    isLoadingHistory,
  } = useAIChatStore();

  const historyAdapter = useMemo<ThreadHistoryAdapter | undefined>(() => {
    if (!activeConversationId) return undefined;

    return {
      async load() {
        return {
          messages: convertToExportedMessages(storedMessages),
        };
      },
      async append(item) {
        const msg = item.message;
        if (activeConversationId && msg.role !== 'system') {
          const textContent = msg.content
            .filter(
              (part): part is { type: 'text'; text: string } =>
                'type' in part && part.type === 'text',
            )
            .map((part) => part.text)
            .join('\n');

          if (textContent) {
            await addMessage({
              conversationId: activeConversationId,
              role: msg.role as 'user' | 'assistant',
              content: textContent,
            });
          }
        }
      },
    };
  }, [activeConversationId, storedMessages, addMessage]);

  return {
    historyAdapter,
    isLoadingHistory,
    hasActiveConversation: !!activeConversationId,
    activeConversationId,
  };
}

/** Desktop path: Antigravity CLI + optional LightRAG via agy (no book index gate). */
const AntigravityAIAssistantChat = ({
  aiSettings,
  bookTitle,
  authorName,
  bookContext,
}: {
  aiSettings: AISettings;
  bookTitle: string;
  authorName: string;
  bookContext: BookContextInput;
}) => {
  const { activeConversationId, conversations, setAgyConversationId } = useAIChatStore();
  const { historyAdapter, isLoadingHistory, hasActiveConversation } = useThreadHistoryAdapter();

  const emptySourceStore = useMemo(() => new ReedySourceStore(), []);

  const agyConversationId =
    conversations.find((c) => c.id === activeConversationId)?.agyConversationId ?? null;

  const optionsRef = useRef({
    settings: aiSettings,
    bookTitle,
    authorName,
    bookContext,
    agyConversationId,
    onAgyConversationId: (id: string) => {
      if (activeConversationId) {
        void setAgyConversationId(activeConversationId, id);
      }
    },
    runCommand: tauriRunCommand,
  });

  useEffect(() => {
    optionsRef.current = {
      settings: aiSettings,
      bookTitle,
      authorName,
      bookContext,
      agyConversationId,
      onAgyConversationId: (id: string) => {
        if (activeConversationId) {
          void setAgyConversationId(activeConversationId, id);
        }
      },
      runCommand: tauriRunCommand,
    };
  });

  const adapter = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs -- intentional: deferred optionsRef read
    return createAntigravityChatAdapter(() => optionsRef.current);
  }, []);

  return (
    <AIAssistantWithRuntime
      adapter={adapter}
      historyAdapter={historyAdapter}
      onResetIndex={() => undefined}
      isLoadingHistory={isLoadingHistory}
      hasActiveConversation={hasActiveConversation}
      sourceStore={emptySourceStore}
      currentTurnId={null}
    />
  );
};

// Web / legacy path that uses the runtime hook + retrieval backends
const AIAssistantChat = ({
  aiSettings,
  bookHash,
  bookTitle,
  authorName,
  currentPage,
  backend,
  sourceStore,
  currentTurnId,
  setCurrentTurnId,
  onSourceClick,
  onResetIndex,
}: {
  aiSettings: AISettings;
  bookHash: string;
  bookTitle: string;
  authorName: string;
  currentPage: number;
  backend: RetrievalBackend;
  sourceStore: ReedySourceStore;
  currentTurnId: string | null;
  setCurrentTurnId: (id: string) => void;
  onSourceClick?: (source: SourceItem) => void;
  onResetIndex: () => void;
}) => {
  const { historyAdapter, isLoadingHistory, hasActiveConversation } = useThreadHistoryAdapter();

  // use a ref to keep up-to-date options without triggering re-renders of the runtime
  const optionsRef = useRef({
    settings: aiSettings,
    bookHash,
    bookTitle,
    authorName,
    currentPage,
    backend,
    sourceStore,
    onTurnStart: setCurrentTurnId,
  });

  // update ref on every render with latest values
  useEffect(() => {
    optionsRef.current = {
      settings: aiSettings,
      bookHash,
      bookTitle,
      authorName,
      currentPage,
      backend,
      sourceStore,
      onTurnStart: setCurrentTurnId,
    };
  });

  // create adapter ONCE and keep it stable
  const adapter = useMemo(() => {
    // eslint-disable-next-line react-hooks/refs -- intentional: we read optionsRef inside a deferred callback, not during render
    return createTauriAdapter(() => optionsRef.current);
  }, []);

  return (
    <AIAssistantWithRuntime
      adapter={adapter}
      historyAdapter={historyAdapter}
      onResetIndex={onResetIndex}
      isLoadingHistory={isLoadingHistory}
      hasActiveConversation={hasActiveConversation}
      sourceStore={sourceStore}
      currentTurnId={currentTurnId}
      onSourceClick={onSourceClick}
    />
  );
};

const AIAssistantWithRuntime = ({
  adapter,
  historyAdapter,
  onResetIndex,
  isLoadingHistory,
  hasActiveConversation,
  sourceStore,
  currentTurnId,
  onSourceClick,
}: {
  adapter: ChatModelAdapter;
  historyAdapter?: ThreadHistoryAdapter;
  onResetIndex: () => void;
  isLoadingHistory: boolean;
  hasActiveConversation: boolean;
  sourceStore: ReedySourceStore;
  currentTurnId: string | null;
  onSourceClick?: (source: SourceItem) => void;
}) => {
  const runtime = useLocalRuntime(adapter, {
    adapters: historyAdapter ? { history: historyAdapter } : undefined,
  });

  if (!runtime) return null;

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadWrapper
        onResetIndex={onResetIndex}
        isLoadingHistory={isLoadingHistory}
        hasActiveConversation={hasActiveConversation}
        sourceStore={sourceStore}
        currentTurnId={currentTurnId}
        onSourceClick={onSourceClick}
      />
    </AssistantRuntimeProvider>
  );
};

const ThreadWrapper = ({
  onResetIndex,
  isLoadingHistory,
  hasActiveConversation,
  sourceStore,
  currentTurnId,
  onSourceClick,
}: {
  onResetIndex: () => void;
  isLoadingHistory: boolean;
  hasActiveConversation: boolean;
  sourceStore: ReedySourceStore;
  currentTurnId: string | null;
  onSourceClick?: (source: SourceItem) => void;
}) => {
  const [sources, setSources] = useState<RetrievedChunk[]>(
    currentTurnId ? sourceStore.get(currentTurnId) : [],
  );
  const assistantRuntime = useAssistantRuntime();
  const { setActiveConversation } = useAIChatStore();

  // Subscribe to the active turn's slot in the source store. Replaces the
  // pre-Reedy 500ms poll over a module-global lastSources (per plan §M1.7).
  useEffect(() => {
    if (!currentTurnId) {
      setSources([]);
      return;
    }
    setSources(sourceStore.get(currentTurnId));
    return sourceStore.subscribe(currentTurnId, setSources);
  }, [currentTurnId, sourceStore]);

  const createConversation = useAIChatStore((s) => s.createConversation);
  const currentBookHash = useAIChatStore((s) => s.currentBookHash);

  const handleClear = useCallback(() => {
    sourceStore.clear();
    setSources([]);
    assistantRuntime.switchToNewThread();
    // Start a fresh persisted conversation instead of nulling the id —
    // otherwise the next turns never hit IndexedDB again.
    if (currentBookHash) {
      void createConversation(currentBookHash, 'New conversation');
    } else {
      void setActiveConversation(null);
    }
  }, [assistantRuntime, createConversation, currentBookHash, setActiveConversation, sourceStore]);

  return (
    <Thread
      sources={sources}
      onSourceClick={onSourceClick}
      onClear={handleClear}
      onResetIndex={onResetIndex}
      isLoadingHistory={isLoadingHistory}
      hasActiveConversation={hasActiveConversation}
    />
  );
};

/**
 * Router: Tauri desktop uses Antigravity notebook chat (bypasses Reedy).
 * Web keeps the legacy / Reedy-MVP path. Reedy agent runtime is not used
 * on the unified desktop path.
 */
const AIAssistant = ({ bookKey }: AIAssistantProps) => {
  if (isTauriAppPlatform()) return <AntigravityNotebookAssistant bookKey={bookKey} />;
  return <LegacyAIAssistant bookKey={bookKey} />;
};

const AntigravityNotebookAssistant = ({ bookKey }: AIAssistantProps) => {
  const _ = useTranslation();
  const { settings } = useSettingsStore();
  const getBookData = useBookDataStore((s) => s.getBookData);
  const ensureActiveConversationForBook = useAIChatStore((s) => s.ensureActiveConversationForBook);
  const bookData = getBookData(bookKey);
  const aiSettings = settings?.aiSettings;
  const book = bookData?.book;
  const metadata = book?.metadata;
  const bookTitle = book?.title || 'Unknown';
  const authorName = book?.author || '';
  const bookHash = bookKey.split('-')[0] || '';

  // Cold start / AI tab open: restore the book's newest thread (or create one)
  // so turns persist via historyAdapter. Without an activeConversationId the
  // adapter is undefined and chat is memory-only — blank after restart.
  useEffect(() => {
    if (!bookHash || !aiSettings?.enabled) return;
    void ensureActiveConversationForBook(bookHash, `Chat about ${bookTitle}`);
  }, [bookHash, bookTitle, aiSettings?.enabled, ensureActiveConversationForBook]);

  // Prefer the same display helpers used elsewhere so language maps /
  // contributor objects become plain strings for the adapter pack.
  const bookContext = useMemo<BookContextInput>(() => {
    const series =
      typeof metadata?.series === 'string' ? metadata.series.trim() || undefined : undefined;
    const subjects = getContributorNames(metadata?.subject);
    const publisher = formatPublisher(metadata?.publisher || '').trim() || undefined;
    const description = formatDescription(metadata?.description) || undefined;
    return {
      title: bookTitle,
      author: authorName || undefined,
      tags: book?.tags?.length ? book.tags : undefined,
      series,
      seriesIndex: getSeriesIndex(metadata?.seriesIndex),
      publisher,
      published: metadata?.published?.trim() || undefined,
      subjects: subjects.length ? subjects : undefined,
      description,
    };
  }, [book?.tags, bookTitle, authorName, metadata]);

  if (!aiSettings?.enabled) {
    return (
      <div className='flex h-full items-center justify-center p-4'>
        <p className='text-muted-foreground text-sm'>{_('Enable AI in Settings')}</p>
      </div>
    );
  }

  return (
    <AntigravityAIAssistantChat
      aiSettings={aiSettings}
      bookTitle={bookTitle}
      authorName={authorName}
      bookContext={bookContext}
    />
  );
};

const LegacyAIAssistant = ({ bookKey }: AIAssistantProps) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const { settings } = useSettingsStore();
  const getBookData = useBookDataStore((s) => s.getBookData);
  const getView = useReaderStore((s) => s.getView);
  const ensureActiveConversationForBook = useAIChatStore((s) => s.ensureActiveConversationForBook);
  const bookData = getBookData(bookKey);
  // Reactive: chat context follows the user's current reading position.
  const progress = useBookProgress(bookKey);

  const [isLoading, setIsLoading] = useState(true);
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexProgress, setIndexProgress] = useState<EmbeddingProgress | null>(null);
  const [indexed, setIndexed] = useState(false);
  const [currentTurnId, setCurrentTurnId] = useState<string | null>(null);

  const bookHash = bookKey.split('-')[0] || '';
  const bookTitle = bookData?.book?.title || 'Unknown';
  const authorName = bookData?.book?.author || '';
  const currentPage = progress?.pageinfo?.current ?? 0;
  const aiSettings = settings?.aiSettings;

  useEffect(() => {
    if (!bookHash || !aiSettings?.enabled) return;
    void ensureActiveConversationForBook(bookHash, `Chat about ${bookTitle}`);
  }, [bookHash, bookTitle, aiSettings?.enabled, ensureActiveConversationForBook]);

  // Per-instance source store, plus the active backend chosen via the same
  // selectBackend gate the chat adapter will hit (Reedy on Tauri when
  // enabled; legacy IDB otherwise).
  const sourceStore = useMemo(() => new ReedySourceStore(), []);
  const backend = useMemo<RetrievalBackend | null>(() => {
    if (!aiSettings) return null;
    const legacy = new LegacyIdbBackend(aiSettings);
    const reedy: RetrievalBackend | null =
      appService && isTauriAppPlatform()
        ? new ReedyBackend(appService as AppService, aiSettings)
        : null;
    return selectBackend({ settings: aiSettings, isTauri: isTauriAppPlatform(), legacy, reedy });
  }, [aiSettings, appService]);

  // check if book is indexed on mount
  useEffect(() => {
    if (bookHash && backend) {
      backend.isIndexed(bookHash).then((result) => {
        setIndexed(result);
        setIsLoading(false);
      });
    } else if (!backend) {
      setIsLoading(false);
    } else {
      setIsLoading(false);
    }
  }, [bookHash, backend]);

  const handleIndex = useCallback(async () => {
    if (!bookData?.bookDoc || !aiSettings || !backend) return;
    setIsIndexing(true);
    try {
      await backend.indexBook(bookData.bookDoc, bookHash, { onProgress: setIndexProgress });
      setIndexed(true);
    } catch (e) {
      aiLogger.rag.indexError(bookHash, (e as Error).message);
    } finally {
      setIsIndexing(false);
      setIndexProgress(null);
    }
  }, [bookData?.bookDoc, bookHash, aiSettings]);

  const handleResetIndex = useCallback(async () => {
    if (!appService || !backend) return;
    if (!(await appService.ask(_('Are you sure you want to re-index this book?')))) return;
    await backend.clearBook(bookHash);
    setIndexed(false);
  }, [bookHash, appService, backend, _]);

  // Navigate the reader to a clicked source's CFI. Legacy backend chunks have
  // no CFI so the Thread component renders them as static rows — only Reedy
  // sources are clickable in M1.10.
  const handleSourceClick = useCallback(
    (source: SourceItem) => {
      if (!source.cfi) return;
      getView(bookKey)?.goTo(source.cfi);
    },
    [bookKey, getView],
  );

  if (!aiSettings?.enabled) {
    return (
      <div className='flex h-full items-center justify-center p-4'>
        <p className='text-muted-foreground text-sm'>{_('Enable AI in Settings')}</p>
      </div>
    );
  }

  // show nothing while checking index status to prevent flicker
  if (isLoading) {
    return null;
  }

  const progressPercent =
    indexProgress?.phase === 'embedding' && indexProgress.total > 0
      ? Math.round((indexProgress.current / indexProgress.total) * 100)
      : 0;

  if (!indexed && !isIndexing) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3 p-4 text-center'>
        <div className='bg-primary/10 rounded-full p-3'>
          <BookOpenIcon className='text-primary size-6' />
        </div>
        <div>
          <h3 className='text-foreground mb-0.5 text-sm font-medium'>{_('Index This Book')}</h3>
          <p className='text-muted-foreground text-xs'>
            {_('Enable AI search and chat for this book')}
          </p>
        </div>
        <Button onClick={handleIndex} size='sm' className='h-8 text-xs'>
          <BookOpenIcon className='mr-1.5 size-3.5' />
          {_('Start Indexing')}
        </Button>
      </div>
    );
  }

  if (isIndexing) {
    return (
      <div className='flex h-full flex-col items-center justify-center gap-3 p-4 text-center'>
        <Loader2Icon className='text-primary size-6 animate-spin' />
        <div>
          <p className='text-foreground mb-1 text-sm font-medium'>{_('Indexing book...')}</p>
          <p className='text-muted-foreground text-xs'>
            {indexProgress?.phase === 'embedding'
              ? `${indexProgress.current} / ${indexProgress.total} chunks`
              : _('Preparing...')}
          </p>
        </div>
        <div className='bg-muted h-1.5 w-32 overflow-hidden rounded-full'>
          <div
            className='bg-primary h-full transition-all duration-300'
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>
    );
  }

  if (!backend) return null;

  return (
    <AIAssistantChat
      aiSettings={aiSettings}
      bookHash={bookHash}
      bookTitle={bookTitle}
      authorName={authorName}
      currentPage={currentPage}
      backend={backend}
      sourceStore={sourceStore}
      currentTurnId={currentTurnId}
      setCurrentTurnId={setCurrentTurnId}
      onSourceClick={handleSourceClick}
      onResetIndex={handleResetIndex}
    />
  );
};

export default AIAssistant;
