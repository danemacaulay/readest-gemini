import { describe, it, expect } from 'vitest';
import { buildAskPrompt, SELECTION_CHAR_LIMIT } from '../../services/ai/ask/promptBuilder';

describe('buildAskPrompt', () => {
  it('asks for the five registers under fixed headings', () => {
    const { prompt } = buildAskPrompt({ bookTitle: 'B', selectionText: 'q' });
    expect(prompt).toContain('## What');
    expect(prompt).toContain('## How');
    expect(prompt).toContain('## Why');
    expect(prompt).toContain('## Should');
    expect(prompt).toContain('## Argue');
    expect(prompt).toContain('What the passage says');
    expect(prompt).toContain('Where it is wrong');
    expect(prompt).toContain('steelman the claim');
    expect(prompt).toContain('genuine counterpoint');
    expect(prompt).not.toContain('Expand:');
    expect(prompt).toContain('Do not use tools');
  });

  it('includes book, author, and quote', () => {
    const result = buildAskPrompt({
      bookTitle: 'Example Book',
      bookAuthor: 'Jane Doe',
      selectionText: 'Some passage',
    });
    expect(result.prompt).toContain('Example Book');
    expect(result.prompt).toContain('Jane Doe');
    expect(result.prompt).toContain('Some passage');
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
