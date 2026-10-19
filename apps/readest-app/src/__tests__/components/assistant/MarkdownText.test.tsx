import { describe, it, expect } from 'vitest';
import { markdownParagraphClassName } from '@/components/assistant/MarkdownText';
import {
  assistantRehypePlugins,
  assistantRemarkPlugins,
} from '@/components/assistant/markdownPlugins';

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

describe('assistant markdown plugins', () => {
  it('includes remark-math and rehype-katex for agy $$ replies', () => {
    expect(assistantRemarkPlugins.length).toBeGreaterThanOrEqual(2);
    expect(assistantRehypePlugins.length).toBeGreaterThanOrEqual(1);
    const math = assistantRemarkPlugins.find(
      (p) => Array.isArray(p) && typeof p[0] === 'function' && p[1]?.singleDollarTextMath === false,
    );
    expect(math).toBeTruthy();
  });
});
