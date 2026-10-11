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

Answer about the selected quote in four short registers, each 2–4 sentences, under exactly these four headings and in this order:

## What
What the passage says: a plain restatement of its claim or content.

## How
How it works: the structure of the argument or image, and what it rests on.

## Why
Why it is here: the context and motive, what the author needs it to do in this book.

## Should
Evaluation: is it right? Where it is wrong, overstated, or worth resisting.

Do not use tools, browse the filesystem, or search the web.
Plain prose under each heading — no JSON, no bullets, no tool traces, nothing before the first heading.

Book: ${input.bookTitle}
Author: ${author}

Quote:
"""
${sel.text}
"""
`;
  return { prompt, truncatedSelection: sel.truncated };
}
