export class AntigravityNotFoundError extends Error {
  constructor(path: string) {
    super(`agy not found at ${path}. Install Antigravity CLI and set the path in Settings.`);
    this.name = 'AntigravityNotFoundError';
  }
}
export class AntigravityAuthError extends Error {
  constructor() {
    super('agy is not authenticated. Run `agy` once in a terminal to sign in.');
    this.name = 'AntigravityAuthError';
  }
}
export class AntigravityTimeoutError extends Error {
  constructor() {
    super('agy timed out waiting for a response.');
    this.name = 'AntigravityTimeoutError';
  }
}
export class AntigravityExitError extends Error {
  constructor(code: number, stderr: string) {
    super(`agy exited with code ${code}: ${stderr}`);
    this.name = 'AntigravityExitError';
  }
}

export type RunCommandResult = { code: number; stdout: string; stderr: string };
export type RunCommandOpts = { timeoutMs: number; signal?: AbortSignal };
export type RunCommand = (
  cmd: string,
  args: string[],
  opts: RunCommandOpts,
) => Promise<RunCommandResult>;

export type AgyParsedOutput = { text: string; conversationId?: string };

export function extractAnswerFromAgyOutput(stdout: string): AgyParsedOutput {
  const lines = stdout
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  let text: string | undefined;
  let conversationId: string | undefined;
  let lastAssistant = '';
  for (const line of lines) {
    if (!line.startsWith('{')) continue;
    try {
      const evt = JSON.parse(line) as {
        event?: string;
        conversation_id?: string;
        result?: { conversation_id?: string; response?: string; status?: string };
        step_update?: { step_type?: string; text_delta?: string };
      };
      if (evt.conversation_id) conversationId = evt.conversation_id;
      if (evt.event === 'result' && evt.result) {
        if (evt.result.conversation_id) conversationId = evt.result.conversation_id;
        if (typeof evt.result.response === 'string') text = evt.result.response.trim();
      }
      if (evt.step_update?.step_type === 'agent_response' && evt.step_update.text_delta) {
        lastAssistant += evt.step_update.text_delta;
      }
    } catch {
      // ignore non-JSON lines
    }
  }
  if (text) return { text, conversationId };
  if (lastAssistant.trim()) return { text: lastAssistant.trim(), conversationId };
  return { text: stdout.trim(), conversationId };
}

export async function completeWithAntigravity(
  prompt: string,
  opts: {
    agyPath: string;
    timeoutMs?: number;
    runCommand: RunCommand;
    conversationId?: string;
    /** When aborted, RunCommand should kill the agy child process. */
    abortSignal?: AbortSignal;
    /**
     * When true (default), pass `--sandbox` for terminal restrictions.
     * Notebook chat sets false so agy can HTTP-retrieve from local LightRAG.
     */
    sandbox?: boolean;
    /** When true, pass `--dangerously-skip-permissions` for headless tool use. */
    skipPermissions?: boolean;
  },
): Promise<AgyParsedOutput> {
  const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
  const sandbox = opts.sandbox !== false;
  const args = ['-p', prompt, '--output-format', 'stream-json'];
  if (sandbox) args.push('--sandbox');
  if (opts.skipPermissions) args.push('--dangerously-skip-permissions');
  if (opts.conversationId) {
    args.push('--conversation', opts.conversationId);
  }
  let result: RunCommandResult;
  try {
    result = await opts.runCommand(opts.agyPath, args, {
      timeoutMs,
      signal: opts.abortSignal,
    });
  } catch (e) {
    const msg = String(e);
    if (msg.includes('ENOENT') || msg.toLowerCase().includes('not found')) {
      throw new AntigravityNotFoundError(opts.agyPath);
    }
    if (msg.toLowerCase().includes('timeout')) throw new AntigravityTimeoutError();
    throw e;
  }

  const combined = `${result.stdout}\n${result.stderr}`.toLowerCase();
  if (combined.includes('authentication required') || combined.includes('not authenticated')) {
    throw new AntigravityAuthError();
  }
  if (result.code !== 0) {
    throw new AntigravityExitError(result.code, result.stderr || result.stdout);
  }
  return extractAnswerFromAgyOutput(result.stdout);
}
