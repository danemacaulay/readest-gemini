export type EchoTrailStatus = 'draft' | 'promoted';

export type EchoSource = {
  id: string;
  title: string;
  snippet: string;
  bookId?: string | number;
  bookTitle?: string;
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
};

export type EchoTrailSeed = {
  bookHash: string;
  cfi?: string;
  seedText?: string;
  question?: string;
  bookTitle?: string;
};

export type EchoTrail = {
  id: string;
  status: EchoTrailStatus;
  seed: EchoTrailSeed;
  synthesis: string;
  sources: EchoSource[];
  books?: EchoBook[];
  ideas?: EchoIdea[];
  connections?: EchoConnection[];
  createdAt: number;
  updatedAt: number;
  agyConversationId?: string;
  /** BookNote stub id when promoted. */
  noteId?: string;
};

export type EchoesSnapshot = {
  trails: EchoTrail[];
};
