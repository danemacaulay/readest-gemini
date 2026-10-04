import { getAIFetch } from '../utils/httpFetch';
import type { EchoesPassage, LightRAGRetrieveResult, LightRAGSource } from './types';

export class LightRAGUnreachableError extends Error {
  constructor(baseUrl: string, detail?: string) {
    super(
      detail ??
        `LightRAG server unreachable at ${baseUrl}. Start lib-rag viz (\`make viz\` → http://127.0.0.1:8765), not the WebUI on :9621.`,
    );
    this.name = 'LightRAGUnreachableError';
  }
}

function passagesToSources(passages: EchoesPassage[]): LightRAGSource[] {
  return passages.map((p) => ({
    id: p.id,
    title: p.title || p.bookTitle || 'Passage',
    snippet: p.snippet || (p.content ?? '').slice(0, 400),
    bookId: p.bookId,
    bookTitle: p.bookTitle,
    kind: p.kind || 'passage',
  }));
}

export function normalizeRetrieveResult(raw: LightRAGRetrieveResult): LightRAGRetrieveResult {
  const passages = raw.passages ?? [];
  const sources = raw.sources?.length
    ? raw.sources
    : passages.length
      ? passagesToSources(passages)
      : [];
  const synthesisContext = raw.synthesisContext || raw.contextText || '';
  return {
    ...raw,
    passages,
    sources,
    synthesisContext,
    contextText: raw.contextText || synthesisContext,
  };
}

export async function retrieveFromLightRAG(opts: {
  baseUrl: string;
  query: string;
  selection?: string;
  mode?: string;
  profile?: 'echoes' | 'raw';
  fetchImpl?: typeof fetch;
}): Promise<LightRAGRetrieveResult> {
  // Prefer Tauri's Rust HTTP client — window.fetch to 127.0.0.1 from the
  // webview is blocked (CORS / private-network), which surfaces as
  // "Failed to fetch" even when viz is healthy.
  const fetchImpl = opts.fetchImpl ?? getAIFetch();
  const base = opts.baseUrl.replace(/\/$/, '');
  const url = `${base}/api/retrieve`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: opts.query,
        selection: opts.selection,
        mode: opts.mode ?? 'hybrid',
        profile: opts.profile ?? 'echoes',
      }),
    });
  } catch {
    throw new LightRAGUnreachableError(base);
  }
  if (!res.ok) {
    // Official LightRAG WebUI (:9621) has /query but not /api/retrieve — that
    // endpoint lives on lib-rag viz (:8765). Surface a specific hint for 404.
    if (res.status === 404) {
      throw new LightRAGUnreachableError(
        base,
        `No /api/retrieve at ${base}. Echoes needs lib-rag viz (\`make viz\` on http://127.0.0.1:8765), not the LightRAG WebUI (:9621).`,
      );
    }
    throw new LightRAGUnreachableError(
      base,
      `LightRAG retrieve failed at ${base} (HTTP ${res.status}). Check lib-rag viz is running.`,
    );
  }
  const raw = (await res.json()) as LightRAGRetrieveResult;
  return normalizeRetrieveResult(raw);
}
