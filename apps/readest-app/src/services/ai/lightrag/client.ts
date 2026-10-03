import type { LightRAGRetrieveResult } from './types';

export class LightRAGUnreachableError extends Error {
  constructor(baseUrl: string) {
    super(`LightRAG server unreachable at ${baseUrl}. Start lib-rag, or use Ask without library.`);
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
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl.replace(/\/$/, '')}/api/retrieve`;
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
    throw new LightRAGUnreachableError(opts.baseUrl);
  }
  if (!res.ok) {
    throw new LightRAGUnreachableError(opts.baseUrl);
  }
  return (await res.json()) as LightRAGRetrieveResult;
}
