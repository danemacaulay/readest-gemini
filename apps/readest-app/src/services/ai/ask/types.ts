import type { LightRAGSource } from '../lightrag/types';

export type AskMode = 'ask' | 'ask-with-library';

export type AskRequest = {
  mode: AskMode;
  bookHash: string;
  bookTitle: string;
  selectionText: string;
  selectionCfi?: string;
  question: string;
};

export type AskResult = {
  answer: string;
  sources: LightRAGSource[];
  truncatedSelection: boolean;
  truncatedLibrary: boolean;
  grounded: boolean;
  agyConversationId?: string;
};
