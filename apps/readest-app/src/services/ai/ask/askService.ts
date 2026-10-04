import { buildAskPrompt } from './promptBuilder';
import type { AskRequest, AskResult } from './types';
import { completeWithAntigravity, type RunCommand } from './antigravityClient';

export type AskDeps = {
  complete: typeof completeWithAntigravity;
  runCommand?: RunCommand;
  agyPath: string;
};

export async function runAsk(req: AskRequest, deps: AskDeps): Promise<AskResult> {
  const built = buildAskPrompt({
    bookTitle: req.bookTitle,
    selectionText: req.selectionText,
    question: req.question,
  });
  const { text } = await deps.complete(built.prompt, {
    agyPath: deps.agyPath,
    runCommand: deps.runCommand!,
    // Keep sandbox; do not skip permissions — Ask answers from the passage
    // and must not roam the filesystem when tools are offered.
    sandbox: true,
    skipPermissions: false,
  });
  return {
    answer: text.trim(),
    truncatedSelection: built.truncatedSelection,
  };
}
