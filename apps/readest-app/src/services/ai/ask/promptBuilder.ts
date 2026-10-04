export const SELECTION_CHAR_LIMIT = 4000;

function truncate(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit) + '\n…[truncated]', truncated: true };
}

export function buildAskPrompt(input: {
  bookTitle: string;
  selectionText: string;
  question: string;
}): { prompt: string; truncatedSelection: boolean } {
  const sel = truncate(input.selectionText.trim(), SELECTION_CHAR_LIMIT);
  const prompt = `You are a careful reading assistant. Answer the user's question about the selected passage only.
Do not use tools, run shell commands, browse the filesystem, or search the web.
Reply with plain prose only — no JSON, no tool traces.

Book: ${input.bookTitle}

Selected passage:
"""
${sel.text}
"""

Question: ${input.question}
`;
  return { prompt, truncatedSelection: sel.truncated };
}
