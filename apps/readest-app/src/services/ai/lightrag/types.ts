export type LightRAGSource = {
  id: string;
  title: string;
  snippet: string;
  score?: number;
  bookId?: string | number;
  bookTitle?: string;
  entityType?: string;
  kind?: string;
};

export type EchoesBookRef = {
  bookId?: number;
  bookTitle?: string;
  referenceId?: string;
  filePath?: string;
  passageCount?: number;
};

export type EchoesPassage = {
  id: string;
  title?: string;
  bookId?: number;
  bookTitle?: string;
  referenceId?: string;
  chunkId?: string;
  filePath?: string;
  snippet?: string;
  content?: string;
  kind?: string;
};

export type EchoesIdea = {
  id: string;
  name: string;
  type?: string;
  description?: string;
  sourceIds?: string[];
  bookIds?: number[];
};

export type EchoesConnection = {
  id: string;
  from: string;
  to: string;
  description?: string;
  bookIds?: number[];
  /** Optional 0–1 confidence from the retrieve payload; never invented client-side. */
  confidence?: number;
};

export type LightRAGRetrieveResult = {
  sources: LightRAGSource[];
  contextText?: string;
  books?: EchoesBookRef[];
  passages?: EchoesPassage[];
  ideas?: EchoesIdea[];
  connections?: EchoesConnection[];
  synthesisContext?: string;
  meta?: Record<string, unknown>;
};
