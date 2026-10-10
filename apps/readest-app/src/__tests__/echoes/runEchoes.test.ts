import { describe, it, expect, vi } from 'vitest';

vi.mock('@/services/ai/utils/httpFetch', () => ({
  getAIFetch: () => globalThis.fetch.bind(globalThis),
}));

const createEchoBookNoteStub = vi.fn();
vi.mock('@/services/echoes/createEchoStub', () => ({
  createEchoBookNoteStub: (...args: unknown[]) => createEchoBookNoteStub(...args),
}));

import type { completeWithAntigravity } from '@/services/ai/ask/antigravityClient';
import { createMemoryEchoStore } from '@/services/echoes/echoStore';
import { buildEchoesPrompt } from '@/services/echoes/promptBuilder';
import {
  buildContinueEchoChatPayload,
  buildEchoChatPreamble,
  continueEchoInChat,
  runEchoes,
} from '@/services/echoes/runEchoes';
import type { EchoTrail } from '@/services/echoes/types';

type CompleteFn = typeof completeWithAntigravity;

describe('buildEchoesPrompt', () => {
  it('requires citing provided source ids and forbids inventing books', () => {
    const { prompt, truncatedSelection, truncatedLibrary } = buildEchoesPrompt({
      bookTitle: 'Meditations',
      seedText: 'The impediment to action advances action.',
      question: 'Where else is obstacle-as-path?',
      sources: [
        {
          id: 's1',
          title: 'Enchiridion',
          snippet: 'Do not seek…',
          bookTitle: 'Epictetus',
        },
      ],
      contextText: 'ctx about obstacles',
    });

    expect(truncatedSelection).toBe(false);
    expect(truncatedLibrary).toBe(false);
    expect(prompt).toContain('Use ONLY the library pack');
    expect(prompt).toContain('Do not invent books');
    expect(prompt).toContain('150–350');
    expect(prompt).toContain('[s1]');
    expect(prompt).toContain('Meditations');
    expect(prompt).toContain('The impediment to action advances action.');
    expect(prompt).toContain('Where else is obstacle-as-path?');
    expect(prompt).toContain('ctx about obstacles');
  });

  it('keeps long synthesis packs without the 8k Ask clamp', () => {
    const fat = 'x'.repeat(20_000);
    const { prompt, truncatedLibrary } = buildEchoesPrompt({
      sources: [],
      synthesisContext: fat,
      passages: [
        {
          id: 's1',
          bookTitle: 'Meditations',
          content: 'The obstacle is the way. '.repeat(50),
        },
      ],
    });
    expect(truncatedLibrary).toBe(false);
    expect(prompt.length).toBeGreaterThan(15_000);
    expect(prompt).toContain('The obstacle is the way.');
  });
});

describe('runEchoes', () => {
  it('retrieves, completes with sandbox, and upserts a promoted trail with annotationId', async () => {
    createEchoBookNoteStub.mockClear();
    const store = createMemoryEchoStore();
    const retrieve = vi.fn(async () => ({
      sources: [
        {
          id: 's1',
          title: 'Enchiridion',
          snippet: 'obstacle…',
          bookId: '42',
          bookTitle: 'Epictetus',
        },
      ],
      contextText: 'library ctx',
    }));
    const complete = vi.fn(async (_prompt, opts) => {
      expect(opts.sandbox).toBe(true);
      return { text: 'Comparative take citing [s1].', conversationId: 'agy-1' };
    });
    const runCommand = vi.fn();
    const annotationId = 'anno-echo-1';

    const trail = await runEchoes(
      {
        bookHash: 'hash-1',
        bookTitle: 'Meditations',
        seedText: 'The impediment…',
        cfi: 'epubcfi(/6/2)',
        question: 'Where else?',
        annotationId,
        annotationIsNew: true,
      },
      {
        lightragBaseUrl: 'http://127.0.0.1:8765',
        lightragMode: 'hybrid',
        agyPath: 'agy',
      },
      { retrieve, complete: complete as CompleteFn, runCommand, store },
    );

    expect(retrieve).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'Where else?',
        selection: 'The impediment…',
        mode: 'hybrid',
        profile: 'echoes',
      }),
    );
    expect(complete).toHaveBeenCalled();
    expect(trail.status).toBe('promoted');
    expect(trail.noteId).toBe(annotationId);
    expect(trail.seed.annotationId).toBe(annotationId);
    expect(trail.seed).not.toHaveProperty('annotationIsNew');
    expect(trail.synthesis).toContain('Comparative take');
    expect(trail.sources[0]?.bookId).toBe('42');
    expect(trail.agyConversationId).toBe('agy-1');
    expect(createEchoBookNoteStub).not.toHaveBeenCalled();
    expect(await store.get(trail.id)).toEqual(trail);
  });

  it('upserts promoted without noteId when annotationId is missing', async () => {
    createEchoBookNoteStub.mockClear();
    const store = createMemoryEchoStore();
    const retrieve = vi.fn(async () => ({ sources: [], contextText: '' }));
    const complete = vi.fn(async () => ({ text: 'Take.', conversationId: 'agy-2' }));

    const trail = await runEchoes(
      {
        bookHash: 'hash-1',
        bookTitle: 'Meditations',
        seedText: 'The impediment…',
      },
      {
        lightragBaseUrl: 'http://127.0.0.1:8765',
        lightragMode: 'hybrid',
        agyPath: 'agy',
      },
      { retrieve, complete: complete as CompleteFn, runCommand: vi.fn(), store },
    );

    expect(trail.status).toBe('promoted');
    expect(trail.noteId).toBeUndefined();
    expect(createEchoBookNoteStub).not.toHaveBeenCalled();
  });
});

describe('continueEchoInChat', () => {
  const trail: EchoTrail = {
    id: 'echo-1',
    status: 'draft',
    seed: {
      bookHash: 'hash-1',
      bookTitle: 'Meditations',
      seedText: 'obstacle advances action',
      question: 'Where else?',
    },
    synthesis: 'Epictetus echoes this in [s1].',
    sources: [{ id: 's1', title: 'Enchiridion', snippet: 'x', bookTitle: 'Epictetus' }],
    synthesisContext: 'RICH_PACK_BODY with long quotes',
    passages: [
      {
        id: 's1',
        bookTitle: 'Epictetus',
        content: 'The full retrieved passage about obstacles.',
      },
    ],
    ideas: [{ id: 'i1', name: 'Assent', type: 'concept', description: 'inner agreement' }],
    connections: [
      { id: 'c1', from: 'Assent', to: 'Judgement', description: 'assent precedes judgement' },
    ],
    createdAt: 1,
    updatedAt: 2,
    agyConversationId: 'agy-9',
  };

  it('builds a full-pack preamble payload for chat', () => {
    const payload = buildContinueEchoChatPayload(trail);
    expect(payload.bookHash).toBe('hash-1');
    expect(payload.title).toMatch(/^Echo:/);
    expect(payload.agyConversationId).toBe('agy-9');
    expect(payload.preamble).toContain('Comparative take');
    expect(payload.preamble).toContain('obstacle advances action');
    expect(payload.preamble).toContain('RICH_PACK_BODY');
    expect(payload.preamble).toContain('The full retrieved passage about obstacles.');
    expect(payload.preamble).toContain('Assent');
    expect(payload.preamble).toContain('Assent → Judgement');
    expect(buildEchoChatPreamble(trail)).toBe(payload.preamble);
  });

  it('creates a conversation with preamble and sets agy id', async () => {
    const createConversation = vi.fn(async () => 'conv-1');
    const addMessage = vi.fn(async () => undefined);
    const setAgyConversationId = vi.fn(async () => undefined);

    const result = await continueEchoInChat(trail, {
      createConversation,
      addMessage,
      setAgyConversationId,
    });

    expect(result.conversationId).toBe('conv-1');
    expect(createConversation).toHaveBeenCalledWith('hash-1', expect.stringMatching(/^Echo:/));
    expect(addMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        role: 'assistant',
        content: expect.stringContaining('Comparative take'),
      }),
    );
    expect(setAgyConversationId).toHaveBeenCalledWith('conv-1', 'agy-9');
  });
});
