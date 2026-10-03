import type { LightRAGSource } from '../lightrag/types';

export type QAThread = {
  id: string;
  bookHash: string;
  bookTitle: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  grounded: boolean;
  selectionCfi?: string;
  agyConversationId?: string;
};

export type QAMessage = {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'error';
  content: string;
  createdAt: number;
  selectionText?: string;
  sources?: LightRAGSource[];
  /** True when this assistant turn used LightRAG (may have empty sources). */
  grounded?: boolean;
};
