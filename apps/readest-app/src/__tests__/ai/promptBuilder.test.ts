import { describe, it, expect } from 'vitest';
import { buildAskPrompt, SELECTION_CHAR_LIMIT } from '../../services/ai/ask/promptBuilder';

describe('buildAskPrompt', () => {
  it('includes book, author, quote, and expand+argue instructions', () => {
    const result = buildAskPrompt({
      bookTitle: 'Example Book',
      bookAuthor: 'Jane Doe',
      selectionText: 'Some passage',
    });
    expect(result.prompt).toContain('Example Book');
    expect(result.prompt).toContain('Jane Doe');
    expect(result.prompt).toContain('Some passage');
    expect(result.prompt).toMatch(/1\) Expand/);
    expect(result.prompt).toMatch(/2\) Argue/);
    expect(result.prompt.toLowerCase()).toMatch(/do not use tools/);
    expect(result.prompt).not.toContain('Question:');
    expect(result.truncatedSelection).toBe(false);
  });

  it('uses Unknown when author is missing', () => {
    const result = buildAskPrompt({
      bookTitle: 'B',
      selectionText: 'sel',
    });
    expect(result.prompt).toContain('Author: Unknown');
  });

  it('truncates long selection', () => {
    const selectionText = 'x'.repeat(SELECTION_CHAR_LIMIT + 50);
    const result = buildAskPrompt({
      bookTitle: 'B',
      selectionText,
    });
    expect(result.truncatedSelection).toBe(true);
    expect(result.prompt).toContain('…[truncated]');
    expect(result.prompt).not.toContain(selectionText);
  });
});
