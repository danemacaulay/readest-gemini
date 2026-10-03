export const RAG_INDEX_TAG = 'rag-index';

/** Calibre stores books under `Author/Title (BOOK_ID)/file.ext`. */
export function parseCalibreBookId(filePath: string | undefined | null): number | null {
  if (!filePath) return null;
  const normalized = filePath.replace(/\\/g, '/');
  const match = normalized.match(/\/[^/]+ \((\d+)\)\/[^/]+$/);
  if (!match) return null;
  const id = Number.parseInt(match[1]!, 10);
  return Number.isFinite(id) ? id : null;
}

export function mergeRagIndexTags(existingTags: string[]): string {
  const tags = existingTags.map((t) => t.trim()).filter(Boolean);
  if (!tags.some((t) => t.toLowerCase() === RAG_INDEX_TAG)) {
    tags.push(RAG_INDEX_TAG);
  }
  // de-dupe preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out.join(', ');
}
