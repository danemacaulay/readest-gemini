import { Command } from '@tauri-apps/plugin-shell';
import type { RunCommand, RunCommandResult } from './antigravityClient';

export const tauriRunCommand: RunCommand = async (cmd, args, opts) => {
  const command = Command.create(cmd, args);
  const child = await Promise.race([
    command.execute(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), opts.timeoutMs),
    ),
  ]);
  return {
    code: child.code ?? 1,
    stdout: child.stdout ?? '',
    stderr: child.stderr ?? '',
  } satisfies RunCommandResult;
};
