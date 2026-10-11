export type EchoTrailStatus = 'draft' | 'promoted';

export type EchoRetrieveTraceEntry = {
  id: string;
  title?: string;
  score?: number;
  bookTitle?: string;
};

export type EchoRetrieveTrace = {
  query: string;
  retrieved: EchoRetrieveTraceEntry[];
  dropped: (EchoRetrieveTraceEntry & { reason: 'below_threshold' })[];
  deferred: boolean;
  minScore: number;
};

export type EchoSource = {
  id: string;
  title: string;
  snippet: string;
  bookId?: string | number;
  bookTitle?: string;
  /** Full retrieved chunk when available (rich retrieve). */
  content?: string;
  /** LightRAG relevance score when provided. */
  score?: number;
};

export type EchoPassage = {
  id: string;
  title?: string;
  bookId?: number;
  bookTitle?: string;
  referenceId?: string;
  chunkId?: string;
  snippet?: string;
  content?: string;
};

export type EchoBook = {
  bookId?: number;
  bookTitle?: string;
  referenceId?: string;
  passageCount?: number;
};

export type EchoIdea = {
  id: string;
  name: string;
  type?: string;
  description?: string;
};

export type EchoConnection = {
  id: string;
  from: string;
  to: string;
  description?: string;
  /** 0–1 when the retrieve payload provides it; never invented client-side. */
  confidence?: number;
};

export type EchoTrailSeed = {
  bookHash: string;
  cfi?: string;
  seedText?: string;
  /** Legacy; unused for new selection-only path. */
  question?: string;
  bookTitle?: string;
  /** Native highlight BookNote id created at Find Echoes time. */
  annotationId?: string;
  /** True when Find Echoes created a new highlight (vs reused existing). */
  annotationIsNew?: boolean;
};

export type EchoTrail = {
  id: string;
  status: EchoTrailStatus;
  seed: EchoTrailSeed;
  synthesis: string;
  sources: EchoSource[];
  books?: EchoBook[];
  /** Server-built rich pack (full quotes + ideas + links). */
  synthesisContext?: string;
  passages?: EchoPassage[];
  ideas?: EchoIdea[];
  connections?: EchoConnection[];
  /** Local retrieve/defer decision record. */
  trace?: EchoRetrieveTrace;
  createdAt: number;
  updatedAt: number;
  agyConversationId?: string;
  /** Annotation BookNote id for new trails; legacy promoted stub id otherwise. */
  noteId?: string;
};

export type EchoesSnapshot = {
  trails: EchoTrail[];
};
