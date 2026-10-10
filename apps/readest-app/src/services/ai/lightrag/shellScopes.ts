import { homedir } from 'node:os';

export const CALIBREDB_SCOPE = 'calibredb';
export const CALIBRE_RAG_SCOPE = 'calibre-rag';
/** @deprecated Kept for PATH merges; shell allowlist uses `calibre-rag` only. */
export const CALIBRE_RAG_VENV_SCOPE = CALIBRE_RAG_SCOPE;

/** Default local lib-rag venv layout under the current user's home (no hardcoded username). */
export const CALIBRE_RAG_VENV_BIN = `${homedir()}/projects/lib-rag/.venv/bin`;
export const VENV_CALIBRE_RAG = `${CALIBRE_RAG_VENV_BIN}/calibre-rag`;
export const CALIBRE_APP_MACOS = '/Applications/calibre.app/Contents/MacOS';

export function resolveCalibreShellScope(
  kind: 'calibredb' | 'calibre-rag',
  configured: string,
): string {
  const trimmed = (configured || '').trim();
  if (kind === 'calibredb') {
    if (!trimmed || trimmed === CALIBREDB_SCOPE || trimmed.endsWith('/calibredb')) {
      return CALIBREDB_SCOPE;
    }
    return trimmed;
  }

  // Absolute venv paths resolve to the PATH-based `calibre-rag` allowlist entry
  // (venv bin is prepended at spawn). Avoids baking a username into capabilities.
  if (
    !trimmed ||
    trimmed === CALIBRE_RAG_SCOPE ||
    trimmed === VENV_CALIBRE_RAG ||
    trimmed.includes('/lib-rag/.venv/bin/calibre-rag') ||
    (trimmed.endsWith('/calibre-rag') && trimmed.includes('/lib-rag/')) ||
    trimmed.endsWith('/calibre-rag')
  ) {
    return CALIBRE_RAG_SCOPE;
  }
  return trimmed;
}

/** Directories prepended to PATH so GUI apps find calibre-rag and calibredb. */
export function calibreToolPathPrefixes(): string[] {
  return [CALIBRE_RAG_VENV_BIN, CALIBRE_APP_MACOS];
}

export function mergeCalibreToolPathEnv(existingPath: string): string {
  const prefixes = calibreToolPathPrefixes();
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
