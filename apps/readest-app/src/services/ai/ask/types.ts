export type AskRequest = {
  bookHash: string;
  bookTitle: string;
  bookAuthor?: string;
  selectionText: string;
  selectionCfi?: string;
};

export type AskResult = {
  answer: string;
  truncatedSelection: boolean;
};
