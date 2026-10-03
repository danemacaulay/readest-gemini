import { describe, it, expect, vi } from 'vitest';
import { retrieveFromLightRAG, LightRAGUnreachableError } from '../../services/ai/lightrag/client';

describe('retrieveFromLightRAG', () => {
  it('maps JSON sources', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            sources: [{ id: 's1', title: 'T', snippet: 'S' }],
            contextText: 'ctx',
          }),
          { status: 200 },
        ),
    );
    const result = await retrieveFromLightRAG({
      baseUrl: 'http://127.0.0.1:8765',
      query: 'q',
      selection: 'sel',
      mode: 'hybrid',
      fetchImpl,
    });
    expect(result.sources[0].id).toBe('s1');
    expect(result.contextText).toBe('ctx');
  });

  it('throws unreachable on network failure', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    await expect(
      retrieveFromLightRAG({
        baseUrl: 'http://127.0.0.1:8765',
        query: 'q',
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(LightRAGUnreachableError);
  });
});
