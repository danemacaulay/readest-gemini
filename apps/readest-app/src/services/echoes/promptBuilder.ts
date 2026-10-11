import type {
  EchoesConnection,
  EchoesIdea,
  EchoesPassage,
  LightRAGSource,
} from '@/services/ai/lightrag/types';

const SELECTION_CHAR_LIMIT = 4000;

/** Soft ceiling only — Echoes prefers dumping rich packs into agy. */
export const ECHOES_LIBRARY_CHAR_LIMIT = 200_000;

export type EchoesPromptInput = {
  bookTitle?: string;
  seedText?: string;
  question?: string;
  readerIntention?: string;
  sources: LightRAGSource[];
  contextText?: string;
  synthesisContext?: string;
  passages?: EchoesPassage[];
  ideas?: EchoesIdea[];
  connections?: EchoesConnection[];
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

function formatPassages(passages: EchoesPassage[], sources: LightRAGSource[]): string {
  if (passages.length) {
    return passages
      .map((p) => {
        const title = p.bookTitle || p.title || 'Passage';
        const body = (p.content || p.snippet || '').trim();
        return `[${p.id}] ${title}\n"""\n${body}\n"""`;
      })
      .join('\n\n');
  }
  return sources
    .map((s) => {
      const book = s.bookTitle ? ` (${s.bookTitle})` : '';
      return `- [${s.id}] ${s.title}${book}: ${s.snippet}`;
    })
    .join('\n');
}

/**
 * Comparative-dialectic prompt for Echoes synthesis.
 * Prefers the server-built synthesisContext and full passage quotes.
 */
export function buildEchoesPrompt(input: EchoesPromptInput): EchoesPromptResult {
  const seed = truncate((input.seedText ?? '').trim(), SELECTION_CHAR_LIMIT);

  const pack = (input.synthesisContext || input.contextText || '').trim();
  const library = truncate(pack, ECHOES_LIBRARY_CHAR_LIMIT);

  const passagesBlock = formatPassages(input.passages ?? [], input.sources ?? []);
  const ideasBlock = (input.ideas ?? [])
    .map((idea) => {
      const type = idea.type ? ` (${idea.type})` : '';
      const desc = idea.description ? `: ${idea.description}` : '';
      return `- [${idea.id}] ${idea.name}${type}${desc}`;
    })
    .join('\n');
  const connectionsBlock = (input.connections ?? [])
    .map((c) => {
      const desc = c.description ? `: ${c.description}` : '';
      return `- [${c.id}] ${c.from} → ${c.to}${desc}`;
    })
    .join('\n');

  const bookLine = input.bookTitle?.trim() ? `Seed book: ${input.bookTitle.trim()}\n` : '';
  const questionLine = input.question?.trim() ? `User question: ${input.question.trim()}\n` : '';
  const intentionLine = input.readerIntention?.trim()
    ? `Reader intention: ${input.readerIntention.trim()}\n`
    : '';
  const seedBlock = seed.text
    ? `Seed passage:\n"""\n${seed.text}\n"""\n`
    : 'Seed passage: (none — synthesize from the question and library context only)\n';

  const prompt = `You are a careful comparative reading assistant. Write a short comparative dialectic across the user's seed thought and the library sources below.

Rules:
- Use ONLY the library pack and passages provided. Do not invent books, authors, or passages.
- When you draw on a passage, cite it inline with its bracket id exactly as given (e.g. [s1], [s2]).
- Do not cite ids that are not listed.
- Aim for about 150–350 words: contrast, affinity, and a clear takeaway — not a chat reply and not a bullet dump.
- Lean on the quotes; the pack is intentionally rich.

${bookLine}${questionLine}${intentionLine}${seedBlock}
Rich library pack:
${library.text || '(none)'}

Passages (full quotes; cite by [id]):
${passagesBlock || '(none)'}

Ideas:
${ideasBlock || '(none)'}

Connections:
${connectionsBlock || '(none)'}
`;

  return {
    prompt,
    truncatedSelection: seed.truncated,
    truncatedLibrary: library.truncated,
  };
}
