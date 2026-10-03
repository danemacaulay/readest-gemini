import { describe, it, expect } from 'vitest';
import {
  buildAskPrompt,
  SELECTION_CHAR_LIMIT,
  LIBRARY_CHAR_LIMIT,
} from '../../services/ai/ask/promptBuilder';

describe('buildAskPrompt', () => {
  it('includes book, selection, and question', () => {
    const result = buildAskPrompt({
      bookTitle: 'Example Book',
      selectionText: 'Some passage',
      question: 'What does this mean?',
      sources: [],
      contextText: undefined,
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
      sources: [],
    });
    expect(result.truncatedSelection).toBe(true);
    expect(result.prompt.length).toBeLessThan(selectionText.length + 500);
  });

  it('injects library sources and caps library context', () => {
    const contextText = 'y'.repeat(LIBRARY_CHAR_LIMIT + 100);
    const result = buildAskPrompt({
      bookTitle: 'B',
      selectionText: 'sel',
      question: 'Q',
      sources: [{ id: 's1', title: 'Concept A', snippet: 'about A' }],
      contextText,
    });
    expect(result.prompt).toContain('[s1]');
    expect(result.prompt).toContain('Concept A');
    expect(result.truncatedLibrary).toBe(true);
  });
});
