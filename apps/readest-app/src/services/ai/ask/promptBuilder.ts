export const SELECTION_CHAR_LIMIT = 4000;

function truncate(text: string, limit: number): { text: string; truncated: boolean } {
  if (text.length <= limit) return { text, truncated: false };
  return { text: text.slice(0, limit) + '\n…[truncated]', truncated: true };
}

export function buildAskPrompt(input: {
  bookTitle: string;
  bookAuthor?: string;
  selectionText: string;
}): { prompt: string; truncatedSelection: boolean } {
  const sel = truncate(input.selectionText.trim(), SELECTION_CHAR_LIMIT);
  const author = input.bookAuthor?.trim() || 'Unknown';
  const prompt = `You are a careful reading assistant. Write a keepable note on the selected quote in light of its author and book.

1) Expand: what the quote is saying, why it matters in context, and what a careful reader might take from it (1–2 short paragraphs).
2) Argue: briefly steelman the claim, then offer one genuine counterpoint or tension (1 short paragraph).

Do not use tools, browse the filesystem, or search the web.
Plain prose only — no JSON, no tool traces. Prefer short paragraphs over bullets.

Book: ${input.bookTitle}
Author: ${author}

Quote:
"""
${sel.text}
"""
`;
  return { prompt, truncatedSelection: sel.truncated };
}
