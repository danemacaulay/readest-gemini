import { create } from 'zustand';
import { AIConversation, AIMessage } from '@/services/ai/types';
import { aiStore } from '@/services/ai/storage/aiStore';

interface AIChatState {
  activeConversationId: string | null;
  conversations: AIConversation[];
  messages: AIMessage[];
  isLoadingHistory: boolean;
  currentBookHash: string | null;

  loadConversations: (bookHash: string) => Promise<void>;
  setActiveConversation: (id: string | null) => Promise<void>;
  createConversation: (bookHash: string, title: string) => Promise<string>;
  /**
   * After restart (or opening a book), make sure the AI tab has a conversation
   * so historyAdapter can persist turns. Restores the newest thread for the
   * book when one exists; otherwise creates a fresh one.
   */
  ensureActiveConversationForBook: (bookHash: string, title: string) => Promise<string>;
  addMessage: (message: Omit<AIMessage, 'id' | 'createdAt'>) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  setAgyConversationId: (id: string, agyConversationId: string) => Promise<void>;
  clearActiveConversation: () => void;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useAIChatStore = create<AIChatState>((set, get) => ({
  activeConversationId: null,
  conversations: [],
  messages: [],
  isLoadingHistory: false,
  currentBookHash: null,

  loadConversations: async (bookHash: string) => {
    if (get().currentBookHash === bookHash && get().conversations.length > 0) {
      return;
    }
    set({ isLoadingHistory: true });
    try {
      const conversations = await aiStore.getConversations(bookHash);
      set({
        conversations,
        currentBookHash: bookHash,
        isLoadingHistory: false,
      });
    } catch {
      set({ isLoadingHistory: false });
    }
  },

  setActiveConversation: async (id: string | null) => {
    if (id === null) {
      set({ activeConversationId: null, messages: [] });
      return;
    }
    set({ isLoadingHistory: true });
    try {
      const messages = await aiStore.getMessages(id);
      set({
        activeConversationId: id,
        messages,
        isLoadingHistory: false,
      });
    } catch {
      set({ activeConversationId: id, messages: [], isLoadingHistory: false });
    }
  },

  createConversation: async (bookHash: string, title: string) => {
    const id = generateId();
    const now = Date.now();
    const conversation: AIConversation = {
      id,
      bookHash,
      title: title.slice(0, 50) || 'New conversation',
      createdAt: now,
      updatedAt: now,
    };
    await aiStore.saveConversation(conversation);
    const conversations = await aiStore.getConversations(bookHash);
    set({
      conversations,
      activeConversationId: id,
      messages: [],
      currentBookHash: bookHash,
    });
    return id;
  },

  ensureActiveConversationForBook: async (bookHash: string, title: string) => {
    await get().loadConversations(bookHash);
    const { activeConversationId, conversations } = get();

    if (activeConversationId && conversations.some((c) => c.id === activeConversationId)) {
      return activeConversationId;
    }

    const latest = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (latest) {
      await get().setActiveConversation(latest.id);
      return latest.id;
    }

    return get().createConversation(bookHash, title);
  },

  addMessage: async (message: Omit<AIMessage, 'id' | 'createdAt'>) => {
    const id = generateId();
    const fullMessage: AIMessage = {
      ...message,
      id,
      createdAt: Date.now(),
    };
    await aiStore.saveMessage(fullMessage);

    // update conversation updatedAt
    const { activeConversationId, currentBookHash } = get();
    if (activeConversationId && currentBookHash) {
      const conversations = get().conversations;
      const conv = conversations.find((c) => c.id === activeConversationId);
      if (conv) {
        conv.updatedAt = Date.now();
        await aiStore.saveConversation(conv);
      }
    }

    set((state) => ({
      messages: [...state.messages, fullMessage],
    }));
  },

  deleteConversation: async (id: string) => {
    const { currentBookHash, activeConversationId } = get();
    await aiStore.deleteConversation(id);

    if (currentBookHash) {
      const conversations = await aiStore.getConversations(currentBookHash);
      set({
        conversations,
        ...(activeConversationId === id ? { activeConversationId: null, messages: [] } : {}),
      });
    }
  },

  renameConversation: async (id: string, title: string) => {
    const { currentBookHash } = get();
    await aiStore.updateConversationTitle(id, title);

    if (currentBookHash) {
      const conversations = await aiStore.getConversations(currentBookHash);
      set({ conversations });
    }
  },

  setAgyConversationId: async (id: string, agyConversationId: string) => {
    await aiStore.updateAgyConversationId(id, agyConversationId);
    set((state) => ({
      conversations: state.conversations.map((c) =>
        c.id === id ? { ...c, agyConversationId, updatedAt: Date.now() } : c,
      ),
    }));
  },

  clearActiveConversation: () => {
    set({ activeConversationId: null, messages: [] });
  },
}));
