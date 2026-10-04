export type EchoTrailStatus = 'draft' | 'promoted';

export type EchoSource = {
  id: string;
  title: string;
  snippet: string;
  bookId?: string;
  bookTitle?: string;
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
  createdAt: number;
  updatedAt: number;
  agyConversationId?: string;
  /** BookNote stub id when promoted. */
  noteId?: string;
};

export type EchoesSnapshot = {
  trails: EchoTrail[];
};
