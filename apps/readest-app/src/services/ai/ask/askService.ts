import { buildAskPrompt } from './promptBuilder';
import type { AskRequest, AskResult } from './types';
import type { LightRAGRetrieveResult } from '../lightrag/types';
import { completeWithAntigravity, type RunCommand } from './antigravityClient';

export type AskDeps = {
  retrieve: (args: {
    baseUrl: string;
    query: string;
    selection?: string;
    mode?: string;
  }) => Promise<LightRAGRetrieveResult>;
  complete: typeof completeWithAntigravity;
  runCommand?: RunCommand;
  agyPath: string;
  lightragBaseUrl: string;
  lightragMode: string;
};

export async function runAsk(req: AskRequest, deps: AskDeps): Promise<AskResult> {
  let sources: LightRAGRetrieveResult['sources'] = [];
  let contextText: string | undefined;
  let grounded = false;

  if (req.mode === 'ask-with-library') {
    const retrieved = await deps.retrieve({
      baseUrl: deps.lightragBaseUrl,
      query: req.question,
      selection: req.selectionText,
      mode: deps.lightragMode,
    });
    sources = retrieved.sources ?? [];
    contextText = retrieved.contextText;
    grounded = true;
  }

  const built = buildAskPrompt({
    bookTitle: req.bookTitle,
    selectionText: req.selectionText,
    question: req.question,
    sources,
    contextText,
  });

  const { text, conversationId } = await deps.complete(built.prompt, {
    agyPath: deps.agyPath,
    runCommand: deps.runCommand!,
  });

  return {
    answer: text,
    sources,
    truncatedSelection: built.truncatedSelection,
    truncatedLibrary: built.truncatedLibrary,
    grounded,
    agyConversationId: conversationId,
  };
}

export async function runFollowUp(
  req: { question: string; agyConversationId: string },
  deps: AskDeps,
): Promise<AskResult> {
  const { text, conversationId } = await deps.complete(req.question, {
    agyPath: deps.agyPath,
    runCommand: deps.runCommand!,
    conversationId: req.agyConversationId,
  });
  return {
    answer: text,
    sources: [],
    truncatedSelection: false,
    truncatedLibrary: false,
    grounded: false,
    agyConversationId: conversationId ?? req.agyConversationId,
  };
}
