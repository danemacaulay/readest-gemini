import { describe, it, expect, vi } from 'vitest';
import { runAsk } from '../../services/ai/ask/askService';

describe('runAsk', () => {
  it('completes without retrieve and returns trimmed answer', async () => {
    const complete = vi.fn(async () => ({ text: '  Answer text  \n', conversationId: 'c1' }));
    const result = await runAsk(
      {
        bookHash: 'h1',
        bookTitle: 'Book',
        selectionText: 'sel',
        question: 'Why?',
      },
      { complete: complete as never, agyPath: 'agy' },
    );
    expect(complete).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ sandbox: true, skipPermissions: false }),
    );
    expect(result.answer).toBe('Answer text');
    expect(result.truncatedSelection).toBe(false);
  });
});
