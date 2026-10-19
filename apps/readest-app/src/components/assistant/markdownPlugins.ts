import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { PluggableList } from 'unified';

/**
 * Chat markdown plugins for assistant replies (agy / Reedy).
 * `$$…$$` display math only — single `$` stays plain text so `$5` is not math.
 */
export const assistantRemarkPlugins: PluggableList = [
  remarkGfm,
  [remarkMath, { singleDollarTextMath: false }],
];

export const assistantRehypePlugins: PluggableList = [[rehypeKatex, { throwOnError: false }]];
