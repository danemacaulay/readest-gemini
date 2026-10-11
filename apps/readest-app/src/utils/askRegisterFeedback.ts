import type { AskRegisterFeedback, AskRegisterKind, BookNote } from '@/types/book';

export type AskReaction = 'like' | 'dislike' | 'correct' | 'incorrect';

export function toggleAskReaction(
  feedback: AskRegisterFeedback | undefined,
  reaction: AskReaction,
  now: number,
): AskRegisterFeedback {
  const next: AskRegisterFeedback = { ...feedback, updatedAt: now };

  if (reaction === 'like' || reaction === 'dislike') {
    if (feedback?.rating === reaction) {
      delete next.rating;
    } else {
      next.rating = reaction;
    }
  } else if (feedback?.verdict === reaction) {
    delete next.verdict;
  } else {
    next.verdict = reaction;
  }

  return next;
}

export function setAskProposal(
  feedback: AskRegisterFeedback | undefined,
  proposal: string,
  now: number,
): AskRegisterFeedback {
  const next: AskRegisterFeedback = { ...feedback, updatedAt: now };
  const trimmed = proposal.trim();
  if (trimmed) {
    next.proposal = trimmed;
  } else {
    delete next.proposal;
  }
  return next;
}

export function updateAskRegisterFeedback(
  booknotes: readonly BookNote[],
  noteId: string,
  kind: AskRegisterKind,
  transform: (feedback: AskRegisterFeedback | undefined) => AskRegisterFeedback,
): { booknotes: BookNote[]; updatedBooknote: BookNote } | null {
  const existingIndex = booknotes.findIndex((note) => note.id === noteId && !note.deletedAt);
  if (existingIndex === -1) return null;

  const existing = booknotes[existingIndex]!;
  if (!existing.askRegisters?.length) return null;

  const askRegisters = existing.askRegisters.map((register) =>
    register.kind === kind ? { ...register, feedback: transform(register.feedback) } : register,
  );

  const updatedBooknote: BookNote = {
    ...existing,
    askRegisters,
  };

  return {
    booknotes: booknotes.map((note, index) => (index === existingIndex ? updatedBooknote : note)),
    updatedBooknote,
  };
}
