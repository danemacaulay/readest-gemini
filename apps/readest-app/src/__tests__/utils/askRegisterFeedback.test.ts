import { describe, expect, it } from 'vitest';
import type { AskRegisterFeedback, BookNote } from '@/types/book';
import {
  setAskProposal,
  toggleAskReaction,
  updateAskRegisterFeedback,
} from '@/utils/askRegisterFeedback';

describe('toggleAskReaction', () => {
  it('sets a rating, replaces the opposite one, and clears on repeat', () => {
    const liked = toggleAskReaction(undefined, 'like', 10);
    expect(liked).toEqual({ rating: 'like', updatedAt: 10 });
    const disliked = toggleAskReaction(liked, 'dislike', 11);
    expect(disliked).toEqual({ rating: 'dislike', updatedAt: 11 });
    const cleared = toggleAskReaction(disliked, 'dislike', 12);
    expect(cleared).toEqual({ updatedAt: 12 });
    expect('rating' in cleared).toBe(false);
  });

  it('keeps rating and verdict independent', () => {
    const f = toggleAskReaction(toggleAskReaction(undefined, 'like', 1), 'incorrect', 2);
    expect(f).toEqual({ rating: 'like', verdict: 'incorrect', updatedAt: 2 });
    expect(toggleAskReaction(f, 'correct', 3).verdict).toBe('correct');
  });
});

describe('setAskProposal', () => {
  it('stores trimmed text and clears on blank', () => {
    const f = setAskProposal({ rating: 'like', updatedAt: 1 }, '  say it plainly  ', 2);
    expect(f).toEqual({ rating: 'like', proposal: 'say it plainly', updatedAt: 2 });
    const cleared = setAskProposal(f, '   ', 3);
    expect('proposal' in cleared).toBe(false);
    expect(cleared.rating).toBe('like');
  });
});

describe('updateAskRegisterFeedback', () => {
  const note: BookNote = {
    id: 'n1',
    type: 'annotation',
    cfi: 'epubcfi(/1)',
    note: 'body',
    createdAt: 1,
    updatedAt: 1000,
    askRegisters: [
      { kind: 'what', text: 'A' },
      { kind: 'how', text: 'B' },
      { kind: 'why', text: 'C' },
      { kind: 'should', text: 'D' },
      { kind: 'argue', text: 'E' },
    ],
  };

  it('replaces only the target register feedback and leaves BookNote.updatedAt alone', () => {
    const res = updateAskRegisterFeedback([note], 'n1', 'why', (f) =>
      toggleAskReaction(f, 'correct', 5),
    );
    expect(res!.updatedBooknote.askRegisters![2]).toEqual({
      kind: 'why',
      text: 'C',
      feedback: { verdict: 'correct', updatedAt: 5 },
    });
    expect(res!.updatedBooknote.askRegisters![0]!.feedback).toBeUndefined();
    expect(res!.updatedBooknote.updatedAt).toBe(1000);
    expect(res!.updatedBooknote.contribution).toBeUndefined();
    expect(note.askRegisters![2]!.feedback).toBeUndefined();
  });

  it('returns null for a missing, deleted, or register-less note', () => {
    const t = (f: AskRegisterFeedback | undefined) => toggleAskReaction(f, 'like', 1);
    expect(updateAskRegisterFeedback([note], 'nope', 'what', t)).toBeNull();
    expect(updateAskRegisterFeedback([{ ...note, deletedAt: 5 }], 'n1', 'what', t)).toBeNull();
    expect(
      updateAskRegisterFeedback([{ ...note, askRegisters: undefined }], 'n1', 'what', t),
    ).toBeNull();
  });
});
