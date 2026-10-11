import type { AskRegister } from '@/types/book';

export type AskRequest = {
  bookHash: string;
  bookTitle: string;
  bookAuthor?: string;
  selectionText: string;
  selectionCfi?: string;
};

export type AskResult = {
  registers: AskRegister[];
  truncatedSelection: boolean;
};
