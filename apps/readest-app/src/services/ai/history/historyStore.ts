import { uniqueId } from '@/utils/misc';
import { safeLoadJSON, safeSaveJSON } from '@/services/persistence';
import type { FileSystem } from '@/types/system';
import type { LightRAGSource } from '../lightrag/types';
import type { QAMessage, QAThread } from './types';

const HISTORY_FILE = 'ask-history.json';
const HISTORY_BASE = 'Data' as const;

export type SaveTurnInput = {
  bookHash: string;
  bookTitle: string;
  question: string;
  answer: string;
  selectionText?: string;
  selectionCfi?: string;
  sources?: LightRAGSource[];
  grounded: boolean;
  agyConversationId?: string;
  /** Reuse on follow-ups; omit to create a new thread. */
  threadId?: string;
  /** When true, the answer is stored as an error message. */
  isError?: boolean;
};

export type HistoryStore = {
  saveTurn(input: SaveTurnInput): Promise<QAThread>;
  searchThreads(query: string): Promise<QAThread[]>;
  listRecent(limit: number): Promise<QAThread[]>;
  getThread(threadId: string): Promise<QAThread | undefined>;
  getMessages(threadId: string): Promise<QAMessage[]>;
  deleteThread(threadId: string): Promise<void>;
  clearAll(): Promise<void>;
};

type HistorySnapshot = {
  threads: QAThread[];
  messages: QAMessage[];
};

const emptySnapshot = (): HistorySnapshot => ({ threads: [], messages: [] });

function threadTitleFromQuestion(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= 80) return trimmed;
  return `${trimmed.slice(0, 77).trimEnd()}…`;
}

function matchesQuery(thread: QAThread, messages: QAMessage[], needle: string): boolean {
  if (thread.title.toLowerCase().includes(needle)) return true;
  if (thread.bookTitle.toLowerCase().includes(needle)) return true;
  return messages.some((m) => m.content.toLowerCase().includes(needle));
}

function createStoreFromState(
  getState: () => HistorySnapshot,
  setState: (next: HistorySnapshot) => void | Promise<void>,
): HistoryStore {
  // Monotonic clock so same-ms saveTurn calls keep stable order.
  let lastStamp = 0;
  const nextStamp = () => {
    const now = Date.now();
    lastStamp = now <= lastStamp ? lastStamp + 1 : now;
    return lastStamp;
  };

  return {
    async saveTurn(input) {
      const state = getState();
      const now = nextStamp();
      let thread = input.threadId ? state.threads.find((t) => t.id === input.threadId) : undefined;

      if (!thread) {
        thread = {
          id: input.threadId ?? uniqueId(),
          bookHash: input.bookHash,
          bookTitle: input.bookTitle,
          title: threadTitleFromQuestion(input.question),
          createdAt: now,
          updatedAt: now,
          grounded: input.grounded,
          selectionCfi: input.selectionCfi,
          agyConversationId: input.agyConversationId,
        };
        state.threads = [...state.threads, thread];
      } else {
        thread = {
          ...thread,
          bookTitle: input.bookTitle,
          updatedAt: now,
          grounded: input.grounded || thread.grounded,
          selectionCfi: input.selectionCfi ?? thread.selectionCfi,
          agyConversationId: input.agyConversationId ?? thread.agyConversationId,
        };
        state.threads = state.threads.map((t) => (t.id === thread!.id ? thread! : t));
      }

      const userMsg: QAMessage = {
        id: uniqueId(),
        threadId: thread.id,
        role: 'user',
        content: input.question,
        createdAt: nextStamp(),
        selectionText: input.selectionText,
      };
      const replyMsg: QAMessage = {
        id: uniqueId(),
        threadId: thread.id,
        role: input.isError ? 'error' : 'assistant',
        content: input.answer,
        createdAt: nextStamp(),
        sources: input.isError ? undefined : input.sources,
      };
      state.messages = [...state.messages, userMsg, replyMsg];
      await setState(state);
      return thread;
    },

    async searchThreads(query) {
      const needle = query.trim().toLowerCase();
      if (!needle) return [];
      const { threads, messages } = getState();
      return threads
        .filter((t) =>
          matchesQuery(
            t,
            messages.filter((m) => m.threadId === t.id),
            needle,
          ),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },

    async listRecent(limit) {
      const n = Math.max(0, limit);
      return [...getState().threads].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, n);
    },

    async getThread(threadId) {
      return getState().threads.find((t) => t.id === threadId);
    },

    async getMessages(threadId) {
      return getState()
        .messages.filter((m) => m.threadId === threadId)
        .sort((a, b) => a.createdAt - b.createdAt);
    },

    async deleteThread(threadId) {
      const state = getState();
      await setState({
        threads: state.threads.filter((t) => t.id !== threadId),
        messages: state.messages.filter((m) => m.threadId !== threadId),
      });
    },

    async clearAll() {
      await setState(emptySnapshot());
    },
  };
}

/** In-memory HistoryStore for tests and ephemeral use. */
export function createMemoryHistoryStore(initial?: HistorySnapshot): HistoryStore {
  let state: HistorySnapshot = {
    threads: [...(initial?.threads ?? [])],
    messages: [...(initial?.messages ?? [])],
  };
  return createStoreFromState(
    () => state,
    (next) => {
      state = { threads: [...next.threads], messages: [...next.messages] };
    },
  );
}

/**
 * Durable HistoryStore backed by a single JSON file under app Data
 * (`ask-history.json`) via Readest `safeLoadJSON` / `safeSaveJSON`.
 */
export function createPersistentHistoryStore(fs: FileSystem): HistoryStore {
  let loaded = false;
  let state: HistorySnapshot = emptySnapshot();
  let chain: Promise<void> = Promise.resolve();

  const ensureLoaded = async () => {
    if (loaded) return;
    const data = await safeLoadJSON<HistorySnapshot>(
      fs,
      HISTORY_FILE,
      HISTORY_BASE,
      emptySnapshot(),
    );
    state = {
      threads: Array.isArray(data.threads) ? data.threads : [],
      messages: Array.isArray(data.messages) ? data.messages : [],
    };
    loaded = true;
  };

  const persist = async (next: HistorySnapshot) => {
    state = { threads: [...next.threads], messages: [...next.messages] };
    await safeSaveJSON(fs, HISTORY_FILE, HISTORY_BASE, state);
  };

  const withLoad = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(async () => {
      await ensureLoaded();
      return fn();
    });
    // Keep the write chain alive even if a caller ignores rejection.
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const inner = createStoreFromState(
    () => state,
    (next) => persist(next),
  );

  return {
    saveTurn: (input) => withLoad(() => inner.saveTurn(input)),
    searchThreads: (query) => withLoad(() => inner.searchThreads(query)),
    listRecent: (limit) => withLoad(() => inner.listRecent(limit)),
    getThread: (threadId) => withLoad(() => inner.getThread(threadId)),
    getMessages: (threadId) => withLoad(() => inner.getMessages(threadId)),
    deleteThread: (threadId) => withLoad(() => inner.deleteThread(threadId)),
    clearAll: () => withLoad(() => inner.clearAll()),
  };
}
