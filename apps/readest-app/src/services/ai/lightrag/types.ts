export type LightRAGSource = {
  id: string;
  title: string;
  snippet: string;
  score?: number;
  bookId?: string;
  bookTitle?: string;
  entityType?: string;
};

export type LightRAGRetrieveResult = {
  sources: LightRAGSource[];
  contextText?: string;
};
