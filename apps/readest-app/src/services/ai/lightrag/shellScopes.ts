export const CALIBREDB_SCOPE = 'calibredb';
export const CALIBRE_RAG_SCOPE = 'calibre-rag';
export const CALIBRE_RAG_VENV_SCOPE = 'calibre-rag-venv';

export const VENV_CALIBRE_RAG = '/Users/danemacaulay/projects/lib-rag/.venv/bin/calibre-rag';
export const CALIBRE_RAG_VENV_BIN = '/Users/danemacaulay/projects/lib-rag/.venv/bin';
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

  if (trimmed === VENV_CALIBRE_RAG || trimmed.includes('/lib-rag/.venv/bin/calibre-rag')) {
    return CALIBRE_RAG_VENV_SCOPE;
  }
  if (!trimmed || trimmed === CALIBRE_RAG_SCOPE) {
    return CALIBRE_RAG_SCOPE;
  }
  if (trimmed.endsWith('/calibre-rag')) {
    if (trimmed.includes('/lib-rag/')) return CALIBRE_RAG_VENV_SCOPE;
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
