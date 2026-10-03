/** Default Tauri shell capability `name` for Antigravity CLI. */
export const AGY_SHELL_SCOPE = 'agy';

/**
 * Map a settings value to a Tauri shell capability name.
 * `Command.create` takes the allowlist `name`, not a filesystem path.
 * Absolute paths / `~/.local/bin/agy` still use the `agy` scope; PATH is
 * augmented at spawn so user-local installs resolve.
 */
export function resolveAgyShellScope(agyPath: string): string {
  const trimmed = (agyPath || AGY_SHELL_SCOPE).trim();
  if (!trimmed || trimmed === AGY_SHELL_SCOPE) return AGY_SHELL_SCOPE;
  if (trimmed === '/usr/local/bin/agy') return 'agy-usr-local';
  if (trimmed === '/opt/homebrew/bin/agy') return 'agy-homebrew';
  // ~/.local/bin/agy and other */agy paths use the PATH-resolved `agy` scope.
  if (trimmed.endsWith('/agy') || trimmed.endsWith('\\agy') || trimmed === 'agy.exe') {
    return AGY_SHELL_SCOPE;
  }
  // Advanced: custom allowlist entry name
  return trimmed;
}

/** Directories prepended to PATH so GUI apps find user-local `agy`. */
export function agyPathPrefixes(home: string): string[] {
  const h = home.replace(/[/\\]+$/, '');
  return [`${h}/.local/bin`, '/opt/homebrew/bin', '/usr/local/bin'];
}

export function mergeAgyPathEnv(home: string, existingPath: string): string {
  const prefixes = agyPathPrefixes(home);
  const parts = existingPath
    ? existingPath.split(':').filter(Boolean)
    : ['/usr/bin', '/bin', '/usr/sbin', '/sbin'];
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const p of [...prefixes, ...parts]) {
    if (!p || seen.has(p)) continue;
    seen.add(p);
    merged.push(p);
  }
  return merged.join(':');
}
