import { describe, it, expect } from 'vitest';
import { markdownParagraphClassName } from '@/components/assistant/MarkdownText';

/**
 * Notebook AI chat renders user/assistant bubbles at text-sm (~14px).
 * Paragraph line-height must stay in the compact chat range — leading-7
 * (28px) is sized for base 16px text and reads as double-spacing when
 * users paste long passages into a chat block.
 */
describe('MarkdownText paragraph spacing', () => {
  it('uses compact leading suitable for text-sm chat bubbles', () => {
    expect(markdownParagraphClassName).toMatch(/\bleading-5\b/);
    expect(markdownParagraphClassName).not.toMatch(/\bleading-7\b/);
  });
});
