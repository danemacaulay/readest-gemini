import type { LightRAGSource } from '../lightrag/types';

export const SELECTION_CHAR_LIMIT = 4000;
export const LIBRARY_CHAR_LIMIT = 8000;

export type PromptBuildInput = {
  bookTitle: string;
  selectionText: string;
  question: string;
  sources: LightRAGSource[];
  contextText?: string;
};

export type PromptBuildResult = {
  prompt: string;
  truncatedSelection: boolean;
  truncatedLibrary: boolean;
};

function truncate(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit) + '\n…[truncated]', truncated: true };
}

export function buildAskPrompt(input: PromptBuildInput): PromptBuildResult {
  const sel = truncate(input.selectionText.trim(), SELECTION_CHAR_LIMIT);
  let libraryBlock = '';
  let truncatedLibrary = false;

  if (input.sources.length > 0 || input.contextText) {
    const sourceLines = input.sources
      .slice(0, 8)
      .map((s) => `- [${s.id}] ${s.title}: ${s.snippet}`)
      .join('\n');
    const ctx = truncate(input.contextText ?? '', LIBRARY_CHAR_LIMIT);
    truncatedLibrary = ctx.truncated;
    libraryBlock = `
Library context (cite by [id] when relevant):
${sourceLines}

${ctx.text}
`;
  }

  const prompt = `You are a careful reading assistant. Answer the user's question about the selected passage. Do not invent library sources.

Book: ${input.bookTitle}

Selected passage:
"""
${sel.text}
"""
${libraryBlock}
Question: ${input.question}
`;

  return {
    prompt,
    truncatedSelection: sel.truncated,
    truncatedLibrary,
  };
}
