import { buildAskPrompt } from './promptBuilder';
import { parseAskRegisters } from './parseAskRegisters';
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
    bookAuthor: req.bookAuthor,
    selectionText: req.selectionText,
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
    registers: parseAskRegisters(text.trim()),
    truncatedSelection: built.truncatedSelection,
  };
}
