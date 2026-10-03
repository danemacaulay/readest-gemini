import { describe, expect, it } from 'vitest';
import {
  AGY_SHELL_SCOPE,
  agyPathPrefixes,
  mergeAgyPathEnv,
  resolveAgyShellScope,
} from '../../services/ai/ask/agyShell';

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
