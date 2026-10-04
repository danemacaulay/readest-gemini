import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGY_SHELL_SCOPE,
  agyPathPrefixes,
  mergeAgyPathEnv,
  resolveAgyShellScope,
} from '../../services/ai/ask/agyShell';

const { mockCreate, mockInvoke } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
  mockInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-shell', () => ({
  Command: { create: mockCreate },
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

describe('resolveAgyShellScope', () => {
  it('defaults to the agy allowlist name', () => {
    expect(resolveAgyShellScope('')).toBe(AGY_SHELL_SCOPE);
    expect(resolveAgyShellScope('agy')).toBe(AGY_SHELL_SCOPE);
  });

  it('maps common absolute installs to allowlisted scopes', () => {
    expect(resolveAgyShellScope('/usr/local/bin/agy')).toBe('agy-usr-local');
    expect(resolveAgyShellScope('/opt/homebrew/bin/agy')).toBe('agy-homebrew');
    expect(resolveAgyShellScope('/Users/me/.local/bin/agy')).toBe(AGY_SHELL_SCOPE);
  });
});

describe('mergeAgyPathEnv', () => {
  it('prepends ~/.local/bin and brew paths ahead of existing PATH', () => {
    const merged = mergeAgyPathEnv('/Users/me', '/usr/bin:/bin');
    expect(merged.startsWith('/Users/me/.local/bin:')).toBe(true);
    expect(merged).toContain('/opt/homebrew/bin');
    expect(merged).toContain('/usr/local/bin');
    expect(merged).toContain('/usr/bin');
    expect(agyPathPrefixes('/Users/me/')).toContain('/Users/me/.local/bin');
  });
});

describe('tauriRunShellCommand abort', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockInvoke.mockReset();
    mockInvoke.mockResolvedValue('');
  });

  it('kills the child process when AbortSignal fires', async () => {
    const kill = vi.fn().mockResolvedValue(undefined);
    let closeHandler: ((payload: { code: number | null }) => void) | undefined;
    let resolveSpawn: ((child: { kill: typeof kill }) => void) | undefined;

    mockCreate.mockReturnValue({
      stdout: { on: vi.fn() },
      stderr: { on: vi.fn() },
      once: vi.fn((event: string, handler: (payload: unknown) => void) => {
        if (event === 'close') {
          closeHandler = handler as (payload: { code: number | null }) => void;
        }
      }),
      spawn: vi.fn(
        () =>
          new Promise<{ kill: typeof kill }>((resolve) => {
            resolveSpawn = resolve;
          }),
      ),
    });

    const { tauriRunShellCommand } = await import('../../services/ai/ask/runCommand');
    const controller = new AbortController();

    const runPromise = tauriRunShellCommand('agy', ['-p', 'hi'], {
      timeoutMs: 60_000,
      signal: controller.signal,
    });

    await vi.waitFor(() => {
      expect(resolveSpawn).toBeTypeOf('function');
    });
    resolveSpawn!({ kill });
    await vi.waitFor(() => {
      expect(closeHandler).toBeTypeOf('function');
    });

    controller.abort();
    expect(kill).toHaveBeenCalled();
    // Simulate shell emitting close after kill.
    closeHandler!({ code: null });

    await expect(runPromise).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('throws AbortError immediately when signal is already aborted', async () => {
    const { tauriRunShellCommand } = await import('../../services/ai/ask/runCommand');
    const controller = new AbortController();
    controller.abort();

    await expect(
      tauriRunShellCommand('agy', ['-p', 'hi'], {
        timeoutMs: 60_000,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockCreate).not.toHaveBeenCalled();
  });
});
