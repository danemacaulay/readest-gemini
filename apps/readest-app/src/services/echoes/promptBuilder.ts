import type { LightRAGSource } from '@/services/ai/lightrag/types';
import { LIBRARY_CHAR_LIMIT, SELECTION_CHAR_LIMIT } from '@/services/ai/ask/promptBuilder';

export type EchoesPromptInput = {
  bookTitle?: string;
  seedText?: string;
  question?: string;
  sources: LightRAGSource[];
  contextText?: string;
};

export type EchoesPromptResult = {
  prompt: string;
  truncatedSelection: boolean;
  truncatedLibrary: boolean;
};

function truncate(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit) + '\n…[truncated]', truncated: true };
}

/**
 * Comparative-dialectic prompt for Echoes synthesis.
 * Grounded only in provided LightRAG sources/context; cites [s1]… by id.
 */
export function buildEchoesPrompt(input: EchoesPromptInput): EchoesPromptResult {
  const seed = truncate((input.seedText ?? '').trim(), SELECTION_CHAR_LIMIT);
  let truncatedLibrary = false;

  const sourceLines = input.sources
    .slice(0, 12)
    .map((s) => {
      const book = s.bookTitle ? ` (${s.bookTitle})` : '';
      return `- [${s.id}] ${s.title}${book}: ${s.snippet}`;
    })
    .join('\n');

  const ctx = truncate(input.contextText ?? '', LIBRARY_CHAR_LIMIT);
  truncatedLibrary = ctx.truncated;

  const bookLine = input.bookTitle?.trim() ? `Seed book: ${input.bookTitle.trim()}\n` : '';
  const questionLine = input.question?.trim() ? `User question: ${input.question.trim()}\n` : '';
  const seedBlock = seed.text
    ? `Seed passage:\n"""\n${seed.text}\n"""\n`
    : 'Seed passage: (none — synthesize from the question and library context only)\n';

  const prompt = `You are a careful comparative reading assistant. Write a short comparative dialectic across the user's seed thought and the library sources below.

Rules:
- Use ONLY the library context and sources provided. Do not invent books, authors, or passages.
- When you draw on a source, cite it inline with its bracket id exactly as given (e.g. [s1], [s2]).
- Do not cite ids that are not listed.
- Aim for about 150–350 words: contrast, affinity, and a clear takeaway — not a chat reply and not a bullet dump.

${bookLine}${questionLine}${seedBlock}
Library sources (cite by [id]):
${sourceLines || '(none)'}

Library context:
${ctx.text || '(none)'}
`;

  return {
    prompt,
    truncatedSelection: seed.truncated,
    truncatedLibrary,
  };
}
