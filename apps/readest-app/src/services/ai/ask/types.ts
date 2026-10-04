export type AskRequest = {
  bookHash: string;
  bookTitle: string;
  selectionText: string;
  selectionCfi?: string;
  question: string;
};

export type AskResult = {
  answer: string;
  truncatedSelection: boolean;
};
