import { describe, it, expect, vi } from 'vitest';
import { runAsk, runFollowUp } from '../../services/ai/ask/askService';

describe('runAsk', () => {
  it('ask mode skips retrieve and returns conversation id', async () => {
    const retrieve = vi.fn();
    const complete = vi.fn(async () => ({ text: 'A', conversationId: 'c-new' }));
    const result = await runAsk(
      {
        mode: 'ask',
        bookHash: 'h1',
        bookTitle: 'Book',
        selectionText: 'sel',
        question: 'Why?',
      },
      {
        retrieve,
        complete: complete as any,
        agyPath: 'agy',
        lightragBaseUrl: 'http://127.0.0.1:8765',
        lightragMode: 'hybrid',
      },
    );
    expect(retrieve).not.toHaveBeenCalled();
    expect(result.answer).toBe('A');
    expect(result.grounded).toBe(false);
    expect(result.sources).toEqual([]);
    expect(result.agyConversationId).toBe('c-new');
  });

  it('ask-with-library retrieves then completes', async () => {
    const retrieve = vi.fn(async () => ({
      sources: [{ id: 's1', title: 'T', snippet: 'S' }],
      contextText: 'ctx',
    }));
    const complete = vi.fn(async () => ({ text: 'Grounded', conversationId: 'c2' }));
    const result = await runAsk(
      {
        mode: 'ask-with-library',
        bookHash: 'h1',
        bookTitle: 'Book',
        selectionText: 'sel',
        question: 'Why?',
      },
      {
        retrieve,
        complete: complete as any,
        agyPath: 'agy',
        lightragBaseUrl: 'http://127.0.0.1:8765',
        lightragMode: 'hybrid',
      },
    );
    expect(retrieve).toHaveBeenCalled();
    expect(result.grounded).toBe(true);
    expect(result.sources[0]?.id).toBe('s1');
    expect(result.answer).toBe('Grounded');
  });
});

describe('runFollowUp', () => {
  it('resumes conversation without retrieve or prompt rebuild of selection', async () => {
    const retrieve = vi.fn();
    const complete = vi.fn(async (_prompt, opts) => {
      expect(opts.conversationId).toBe('c1');
      return { text: 'More detail', conversationId: 'c1' };
    });
    const result = await runFollowUp(
      { question: 'Say more', agyConversationId: 'c1' },
      {
        retrieve,
        complete: complete as any,
        agyPath: 'agy',
        lightragBaseUrl: 'http://127.0.0.1:8765',
        lightragMode: 'hybrid',
      },
    );
    expect(retrieve).not.toHaveBeenCalled();
    expect(complete).toHaveBeenCalledWith(
      'Say more',
      expect.objectContaining({ conversationId: 'c1' }),
    );
    expect(result.answer).toBe('More detail');
    expect(result.agyConversationId).toBe('c1');
    expect(result.grounded).toBe(false);
  });
});
