import { describe, expect, it } from 'vitest';
import { ASK_REGISTER_KINDS, renderAskRegistersMarkdown } from '@/utils/askRegisters';

describe('renderAskRegistersMarkdown', () => {
  it('renders bold label paragraphs in canonical order', () => {
    const body = renderAskRegistersMarkdown([
      { kind: 'what', text: 'A claim.' },
      { kind: 'how', text: 'By analogy.' },
      { kind: 'why', text: 'To set up ch. 3.' },
      { kind: 'should', text: 'Overstated.' },
    ]);
    expect(body).toBe(
      '**What**\n\nA claim.\n\n**How**\n\nBy analogy.\n\n**Why**\n\nTo set up ch. 3.\n\n**Should**\n\nOverstated.',
    );
  });

  it('exposes the four kinds in order', () => {
    expect([...ASK_REGISTER_KINDS]).toEqual(['what', 'how', 'why', 'should']);
  });
});
