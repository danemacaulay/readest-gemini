import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { Options } from 'react-markdown';

/**
 * Chat markdown plugins for assistant replies (agy / Reedy).
 * `$$…$$` display math only — single `$` stays plain text so `$5` is not math.
 */
export const assistantRemarkPlugins: NonNullable<Options['remarkPlugins']> = [
  remarkGfm,
  [remarkMath, { singleDollarTextMath: false }],
];

export const assistantRehypePlugins: NonNullable<Options['rehypePlugins']> = [
  [rehypeKatex, { throwOnError: false }],
];
