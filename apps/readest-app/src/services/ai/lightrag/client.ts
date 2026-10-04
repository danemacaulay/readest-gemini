import { getAIFetch } from '../utils/httpFetch';
import type { LightRAGRetrieveResult } from './types';

export class LightRAGUnreachableError extends Error {
  constructor(baseUrl: string, detail?: string) {
    super(
      detail ??
        `LightRAG server unreachable at ${baseUrl}. Start lib-rag viz (\`make viz\` → http://127.0.0.1:8765), not the WebUI on :9621.`,
    );
    this.name = 'LightRAGUnreachableError';
  }
}

export async function retrieveFromLightRAG(opts: {
  baseUrl: string;
  query: string;
  selection?: string;
  mode?: string;
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
  return (await res.json()) as LightRAGRetrieveResult;
}
