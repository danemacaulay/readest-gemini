import { invoke } from '@tauri-apps/api/core';
import { Command, type Child, type TerminatedPayload } from '@tauri-apps/plugin-shell';
import type { RunCommand, RunCommandOpts, RunCommandResult } from './antigravityClient';
import {
  CALIBRE_RAG_SCOPE,
  CALIBRE_RAG_VENV_SCOPE,
  CALIBREDB_SCOPE,
  mergeCalibreToolPathEnv,
} from '../lightrag/shellScopes';
import { mergeAgyPathEnv, resolveAgyShellScope } from './agyShell';

export {
  AGY_SHELL_SCOPE,
  agyPathPrefixes,
  mergeAgyPathEnv,
  resolveAgyShellScope,
} from './agyShell';

const PRE_RESOLVED_SHELL_SCOPES = new Set([
  CALIBREDB_SCOPE,
  CALIBRE_RAG_SCOPE,
  CALIBRE_RAG_VENV_SCOPE,
]);

function abortError(): Error {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
}

async function buildAgySpawnEnv(): Promise<Record<string, string> | undefined> {
  try {
    const [home, pathVar] = await Promise.all([
      invoke<string>('get_environment_variable', { name: 'HOME' }),
      invoke<string>('get_environment_variable', { name: 'PATH' }),
    ]);
    if (!home) return undefined;
    const pathWithAgy = mergeAgyPathEnv(home, pathVar || '');
    return { PATH: mergeCalibreToolPathEnv(pathWithAgy) };
  } catch {
    return undefined;
  }
}

/**
 * Run an allowlisted shell command by capability `name`, killing the child on timeout or abort.
 * Does not remap through `resolveAgyShellScope` — pass a pre-resolved allowlist name.
 */
export async function tauriRunShellCommand(
  scopeName: string,
  args: string[],
  opts: RunCommandOpts,
): Promise<RunCommandResult> {
  if (opts.signal?.aborted) throw abortError();

  const env = await buildAgySpawnEnv();
  const command = Command.create(scopeName, args, env ? { env } : undefined);

  let stdout = '';
  let stderr = '';
  command.stdout.on('data', (line) => {
    stdout += `${line}\n`;
  });
  command.stderr.on('data', (line) => {
    stderr += `${line}\n`;
  });

  let child: Child | undefined;
  let timedOut = false;
  let aborted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onAbort = () => {
    aborted = true;
    void child?.kill().catch(() => undefined);
  };
  opts.signal?.addEventListener('abort', onAbort);

  try {
    const closed = new Promise<TerminatedPayload>((resolve, reject) => {
      command.once('close', (payload) => resolve(payload));
      command.once('error', (err) => reject(new Error(String(err))));
    });

    child = await command.spawn();
    if (aborted || opts.signal?.aborted) {
      aborted = true;
      void child.kill().catch(() => undefined);
      throw abortError();
    }

    timer = setTimeout(() => {
      timedOut = true;
      void child?.kill().catch(() => undefined);
    }, opts.timeoutMs);

    const payload = await closed;
    if (aborted || opts.signal?.aborted) throw abortError();
    if (timedOut) throw new Error('timeout');

    return {
      code: payload.code ?? 1,
      stdout,
      stderr,
    } satisfies RunCommandResult;
  } catch (err) {
    if (aborted || opts.signal?.aborted) throw abortError();
    if (timedOut) throw new Error('timeout');
    if (child) {
      void child.kill().catch(() => undefined);
    }
    throw err;
  } finally {
    opts.signal?.removeEventListener('abort', onAbort);
    if (timer) clearTimeout(timer);
  }
}

/**
 * Run an allowlisted shell command, killing the child on timeout.
 * Prefers `spawn` + `kill` so timed-out `agy` processes do not keep running.
 * Pre-resolved Calibre allowlist names are passed through unchanged.
 */
export const tauriRunCommand: RunCommand = async (cmd, args, opts) => {
  const program = PRE_RESOLVED_SHELL_SCOPES.has(cmd) ? cmd : resolveAgyShellScope(cmd);
  return tauriRunShellCommand(program, args, opts);
};
