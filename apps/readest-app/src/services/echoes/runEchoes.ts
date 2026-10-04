import { retrieveFromLightRAG } from '@/services/ai/lightrag/client';
import type { EchoesPassage, LightRAGSource } from '@/services/ai/lightrag/types';
import { completeWithAntigravity, type RunCommand } from '@/services/ai/ask/antigravityClient';
import type { EchoStore } from './echoStore';
import { buildEchoesPrompt } from './promptBuilder';
import type { EchoSource, EchoTrail, EchoTrailSeed } from './types';

export type EchoesAiSettings = {
  lightragBaseUrl: string;
  lightragMode: string;
  agyPath: string;
};

export type EchoesDeps = {
  retrieve?: typeof retrieveFromLightRAG;
  complete?: typeof completeWithAntigravity;
  runCommand: RunCommand;
  store: EchoStore;
  /** Abort in-flight agy when set. */
  abortSignal?: AbortSignal;
};

export type ContinueEchoChatDeps = {
  createConversation: (bookHash: string, title: string) => Promise<string>;
  addMessage: (message: {
    conversationId: string;
    role: 'user' | 'assistant';
    content: string;
  }) => Promise<void>;
  setAgyConversationId?: (conversationId: string, agyConversationId: string) => Promise<void>;
};

export type ContinueEchoChatPayload = {
  bookHash: string;
  title: string;
  preamble: string;
  agyConversationId?: string;
};

export type ContinueEchoChatResult = {
  conversationId: string;
  payload: ContinueEchoChatPayload;
};

function toEchoSources(sources: LightRAGSource[], passages?: EchoesPassage[]): EchoSource[] {
  const byId = new Map((passages ?? []).map((p) => [p.id, p]));
  return sources.map((s) => {
    const passage = byId.get(s.id);
    return {
      id: s.id,
      title: s.title,
      snippet: s.snippet,
      bookId: s.bookId ?? passage?.bookId,
      bookTitle: s.bookTitle || passage?.bookTitle,
      content: passage?.content || passage?.snippet || s.snippet,
    };
  });
}

function retrieveQuery(seed: EchoTrailSeed): string {
  const question = seed.question?.trim();
  if (question) return question;
  const text = seed.seedText?.trim();
  if (text) return text;
  return seed.bookTitle?.trim() || 'related ideas across my library';
}

/** Build the full trail dump used to hand an EchoTrail into notebook chat. */
export function buildEchoChatPreamble(trail: EchoTrail): string {
  const parts: string[] = ['[Echoes trail — continue from this comparative take]'];
  if (trail.seed.bookTitle) parts.push(`Seed book: ${trail.seed.bookTitle}`);
  if (trail.seed.question?.trim()) parts.push(`Question: ${trail.seed.question.trim()}`);
  if (trail.seed.seedText?.trim()) {
    parts.push(`Seed passage:\n"""\n${trail.seed.seedText.trim()}\n"""`);
  }
  if (trail.synthesis.trim()) {
    parts.push(`Comparative take:\n${trail.synthesis.trim()}`);
  }

  const pack = trail.synthesisContext?.trim();
  if (pack) {
    parts.push(`Rich library pack:\n${pack}`);
  }

  const passages = trail.passages?.length
    ? trail.passages
    : trail.sources.map((s) => ({
        id: s.id,
        bookTitle: s.bookTitle,
        title: s.title,
        content: s.content,
        snippet: s.snippet,
      }));
  if (passages.length) {
    const block = passages
      .map((p) => {
        const title = p.bookTitle || p.title || 'Passage';
        const body = (p.content || p.snippet || '').trim();
        return `[${p.id}] ${title}\n"""\n${body}\n"""`;
      })
      .join('\n\n');
    parts.push(`Passages (full quotes; cite by [id]):\n${block}`);
  }

  if (trail.books?.length) {
    parts.push(
      `Books:\n${trail.books
        .map(
          (b) =>
            `- ${b.bookTitle || b.bookId}${b.passageCount != null ? ` (${b.passageCount})` : ''}`,
        )
        .join('\n')}`,
    );
  }

  if (trail.ideas?.length) {
    parts.push(
      `Ideas:\n${trail.ideas
        .map((idea) => {
          const type = idea.type ? ` (${idea.type})` : '';
          const desc = idea.description ? `: ${idea.description}` : '';
          return `- [${idea.id}] ${idea.name}${type}${desc}`;
        })
        .join('\n')}`,
    );
  }

  if (trail.connections?.length) {
    parts.push(
      `Connections:\n${trail.connections
        .map((c) => {
          const desc = c.description ? `: ${c.description}` : '';
          return `- [${c.id}] ${c.from} → ${c.to}${desc}`;
        })
        .join('\n')}`,
    );
  }

  parts.push(
    'Continue the conversation from here. Use ONLY this library pack and passages; cite [id]s; do not invent books.',
  );
  return parts.join('\n\n');
}

export function buildContinueEchoChatPayload(trail: EchoTrail): ContinueEchoChatPayload {
  const titleBase =
    trail.seed.question?.trim() ||
    trail.seed.seedText?.trim()?.slice(0, 40) ||
    trail.seed.bookTitle ||
    'Echoes';
  return {
    bookHash: trail.seed.bookHash,
    title: `Echo: ${titleBase}`.slice(0, 50),
    preamble: buildEchoChatPreamble(trail),
    agyConversationId: trail.agyConversationId,
  };
}

/**
 * Retrieve from LightRAG, synthesize a comparative take via agy (sandbox on),
 * and upsert a draft EchoTrail.
 */
export async function runEchoes(
  seed: EchoTrailSeed,
  aiSettings: EchoesAiSettings,
  deps: EchoesDeps,
): Promise<EchoTrail> {
  const retrieve = deps.retrieve ?? retrieveFromLightRAG;
  const complete = deps.complete ?? completeWithAntigravity;

  const retrieved = await retrieve({
    baseUrl: aiSettings.lightragBaseUrl,
    query: retrieveQuery(seed),
    selection: seed.seedText,
    mode: aiSettings.lightragMode,
    profile: 'echoes',
  });

  const sources = retrieved.sources ?? [];
  const built = buildEchoesPrompt({
    bookTitle: seed.bookTitle,
    seedText: seed.seedText,
    question: seed.question,
    sources,
    contextText: retrieved.contextText,
    synthesisContext: retrieved.synthesisContext,
    passages: retrieved.passages,
    ideas: retrieved.ideas,
    connections: retrieved.connections,
  });

  const { text, conversationId } = await complete(built.prompt, {
    agyPath: aiSettings.agyPath,
    runCommand: deps.runCommand,
    sandbox: true,
    abortSignal: deps.abortSignal,
    // Rich multi-call packs can be large; give agy more wall time.
    timeoutMs: 10 * 60 * 1000,
  });

  return deps.store.upsert({
    status: 'draft',
    seed,
    synthesis: text,
    sources: toEchoSources(sources, retrieved.passages),
    books: retrieved.books?.map((b) => ({
      bookId: b.bookId,
      bookTitle: b.bookTitle,
      referenceId: b.referenceId,
      passageCount: b.passageCount,
    })),
    synthesisContext: retrieved.synthesisContext || retrieved.contextText,
    passages: retrieved.passages?.map((p) => ({
      id: p.id,
      title: p.title,
      bookId: p.bookId,
      bookTitle: p.bookTitle,
      referenceId: p.referenceId,
      chunkId: p.chunkId,
      snippet: p.snippet,
      content: p.content,
    })),
    ideas: retrieved.ideas?.map((i) => ({
      id: i.id,
      name: i.name,
      type: i.type,
      description: i.description,
    })),
    connections: retrieved.connections?.map((c) => ({
      id: c.id,
      from: c.from,
      to: c.to,
      description: c.description,
    })),
    agyConversationId: conversationId,
  });
}

/**
 * Create a notebook AI conversation seeded with the EchoTrail preamble,
 * optionally linking the existing agy conversation id.
 *
 * Callers that only need the payload (UI creates the conversation) can use
 * {@link buildContinueEchoChatPayload} directly.
 */
export async function continueEchoInChat(
  trail: EchoTrail,
  deps: ContinueEchoChatDeps,
): Promise<ContinueEchoChatResult> {
  const payload = buildContinueEchoChatPayload(trail);
  const conversationId = await deps.createConversation(payload.bookHash, payload.title);
  await deps.addMessage({
    conversationId,
    role: 'assistant',
    content: payload.preamble,
  });
  if (payload.agyConversationId && deps.setAgyConversationId) {
    await deps.setAgyConversationId(conversationId, payload.agyConversationId);
  }
  return { conversationId, payload };
}
