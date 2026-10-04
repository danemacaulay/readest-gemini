import { retrieveFromLightRAG } from '@/services/ai/lightrag/client';
import type { LightRAGSource } from '@/services/ai/lightrag/types';
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

function toEchoSources(sources: LightRAGSource[]): EchoSource[] {
  return sources.map((s) => ({
    id: s.id,
    title: s.title,
    snippet: s.snippet,
    bookId: s.bookId,
    bookTitle: s.bookTitle,
  }));
}

function retrieveQuery(seed: EchoTrailSeed): string {
  const question = seed.question?.trim();
  if (question) return question;
  const text = seed.seedText?.trim();
  if (text) return text;
  return seed.bookTitle?.trim() || 'related ideas across my library';
}

/** Build the seed+synthesis preamble used to hand an EchoTrail into notebook chat. */
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
  if (trail.sources.length) {
    parts.push(
      `Sources: ${trail.sources.map((s) => `[${s.id}] ${s.bookTitle || s.title}`).join('; ')}`,
    );
  }
  parts.push('Continue the conversation from here. Prefer these sources; do not invent books.');
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
  });

  const sources = retrieved.sources ?? [];
  const built = buildEchoesPrompt({
    bookTitle: seed.bookTitle,
    seedText: seed.seedText,
    question: seed.question,
    sources,
    contextText: retrieved.contextText,
  });

  const { text, conversationId } = await complete(built.prompt, {
    agyPath: aiSettings.agyPath,
    runCommand: deps.runCommand,
    sandbox: true,
    abortSignal: deps.abortSignal,
  });

  return deps.store.upsert({
    status: 'draft',
    seed,
    synthesis: text,
    sources: toEchoSources(sources),
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
