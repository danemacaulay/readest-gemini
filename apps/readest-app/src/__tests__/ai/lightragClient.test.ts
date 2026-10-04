import { describe, it, expect, vi } from 'vitest';

vi.mock('@/services/ai/utils/httpFetch', () => ({
  getAIFetch: () => {
    throw new Error('getAIFetch should not be used when fetchImpl is provided');
  },
}));

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
    expect(result.sources[0]?.id).toBe('s1');
    expect(result.contextText).toBe('ctx');
  });

  it('passes through bookId, bookTitle, and snippet when present', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            sources: [
              {
                id: 's2',
                title: 'Chapter 3',
                snippet: 'Assent is judgment…',
                bookId: 'hash-meditations',
                bookTitle: 'Meditations',
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const result = await retrieveFromLightRAG({
      baseUrl: 'http://127.0.0.1:8765',
      query: 'assent',
      fetchImpl,
    });
    expect(result.sources[0]).toEqual({
      id: 's2',
      title: 'Chapter 3',
      snippet: 'Assent is judgment…',
      bookId: 'hash-meditations',
      bookTitle: 'Meditations',
    });
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

  it('hints make viz when /api/retrieve is missing (WebUI on :9621)', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ detail: 'Not Found' }), { status: 404 }),
    );
    await expect(
      retrieveFromLightRAG({
        baseUrl: 'http://127.0.0.1:9621',
        query: 'q',
        fetchImpl,
      }),
    ).rejects.toMatchObject({
      name: 'LightRAGUnreachableError',
      message: expect.stringContaining('make viz'),
    });
  });

  it('parses rich echoes payload and aliases passages to sources', async () => {
    const fetchImpl = vi.fn(async (_url, init) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      expect(body.profile).toBe('echoes');
      return new Response(
        JSON.stringify({
          books: [{ bookId: 1, bookTitle: 'Meditations', referenceId: '1', passageCount: 1 }],
          passages: [
            {
              id: 's1',
              bookId: 1,
              bookTitle: 'Meditations',
              content: 'The obstacle is the way.',
              snippet: 'The obstacle is the way.',
            },
          ],
          ideas: [{ id: 'i1', name: 'Assent', type: 'concept' }],
          connections: [{ id: 'c1', from: 'Assent', to: 'Judgement' }],
          synthesisContext: 'rich pack',
        }),
        { status: 200 },
      );
    });
    const result = await retrieveFromLightRAG({
      baseUrl: 'http://127.0.0.1:8765',
      query: 'assent',
      fetchImpl,
    });
    expect(result.synthesisContext).toBe('rich pack');
    expect(result.contextText).toBe('rich pack');
    expect(result.sources[0]?.bookTitle).toBe('Meditations');
    expect(result.ideas?.[0]?.name).toBe('Assent');
    expect(result.books?.[0]?.bookId).toBe(1);
  });
});
