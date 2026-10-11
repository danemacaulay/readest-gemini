import { describe, it, expect, vi } from 'vitest';
import { runAsk } from '../../services/ai/ask/askService';

describe('runAsk', () => {
  it('builds the prompt, calls complete in sandbox, and returns parsed registers', async () => {
    const complete = vi.fn(async () => ({
      text: '## What\nA.\n## How\nB.\n## Why\nC.\n## Should\nD.\n## Argue\nE.',
    }));
    const res = await runAsk(
      { bookHash: 'h', bookTitle: 'T', selectionText: 'sel' },
      { complete: complete as never, runCommand: vi.fn() as never, agyPath: 'agy' },
    );
    expect(res.registers.map((r) => r.text)).toEqual(['A.', 'B.', 'C.', 'D.', 'E.']);
    expect(res.truncatedSelection).toBe(false);
    expect(complete).toHaveBeenCalledWith(
      expect.stringContaining('## Argue'),
      expect.objectContaining({ sandbox: true, skipPermissions: false }),
    );
  });
});
