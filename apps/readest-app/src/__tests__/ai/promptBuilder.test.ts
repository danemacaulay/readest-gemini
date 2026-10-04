import { describe, it, expect } from 'vitest';
import { buildAskPrompt, SELECTION_CHAR_LIMIT } from '../../services/ai/ask/promptBuilder';

describe('buildAskPrompt', () => {
  it('includes book, selection, and question', () => {
    const result = buildAskPrompt({
      bookTitle: 'Example Book',
      selectionText: 'Some passage',
      question: 'What does this mean?',
    });
    expect(result.prompt).toContain('Example Book');
    expect(result.prompt).toContain('Some passage');
    expect(result.prompt).toContain('What does this mean?');
    expect(result.truncatedSelection).toBe(false);
  });

  it('truncates long selection', () => {
    const selectionText = 'x'.repeat(SELECTION_CHAR_LIMIT + 50);
    const result = buildAskPrompt({
      bookTitle: 'B',
      selectionText,
      question: 'Q',
    });
    expect(result.truncatedSelection).toBe(true);
    expect(result.prompt.length).toBeLessThan(selectionText.length + 500);
  });

  it('does not expose library context in prompt API', () => {
    const result = buildAskPrompt({
      bookTitle: 'B',
      selectionText: 'sel',
      question: 'Q',
    });
    expect(result.prompt).not.toContain('Library context');
    expect('truncatedLibrary' in result).toBe(false);
  });
});
