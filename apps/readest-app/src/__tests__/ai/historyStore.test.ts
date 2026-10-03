import { describe, it, expect } from 'vitest';
import { createMemoryHistoryStore } from '../../services/ai/history/historyStore';

describe('historyStore', () => {
  it('saves turns and searches across books', async () => {
    const store = createMemoryHistoryStore();
    await store.saveTurn({
      bookHash: 'a',
      bookTitle: 'Alpha',
      question: 'What is virtue?',
      answer: 'Excellence of character',
      selectionText: 'arete',
      selectionCfi: 'epubcfi(/6/4)',
      sources: [],
      grounded: false,
    });
    await store.saveTurn({
      bookHash: 'b',
      bookTitle: 'Beta',
      question: 'Stoic assent',
      answer: 'Judgment',
      selectionText: 'synkatathesis',
      grounded: true,
      sources: [{ id: 's1', title: 'Assent', snippet: '...' }],
    });
    const hits = await store.searchThreads('virtue');
    expect(hits).toHaveLength(1);
    expect(hits[0].bookTitle).toBe('Alpha');
    const all = await store.searchThreads('stoic');
    expect(all[0].grounded).toBe(true);
  });

  it('searches case-insensitively over title, bookTitle, and message content', async () => {
    const store = createMemoryHistoryStore();
    const thread = await store.saveTurn({
      bookHash: 'a',
      bookTitle: 'Meditations',
      question: 'What is logos?',
      answer: 'Rational principle',
      grounded: false,
      sources: [],
    });

    expect(await store.searchThreads('MEDITATIONS')).toHaveLength(1);
    expect(await store.searchThreads('logos')).toHaveLength(1);
    expect(await store.searchThreads('RATIONAL')).toHaveLength(1);
    const titleHits = await store.searchThreads(thread.title.slice(0, 4).toUpperCase());
    expect(titleHits.length).toBeGreaterThan(0);
    expect(await store.searchThreads('no-such-term')).toHaveLength(0);
  });

  it('reuses threadId and persists agyConversationId on follow-ups', async () => {
    const store = createMemoryHistoryStore();
    const first = await store.saveTurn({
      bookHash: 'a',
      bookTitle: 'Alpha',
      question: 'Q1',
      answer: 'A1',
      grounded: false,
      sources: [],
      agyConversationId: 'conv-1',
    });
    expect(first.agyConversationId).toBe('conv-1');

    const second = await store.saveTurn({
      bookHash: 'a',
      bookTitle: 'Alpha',
      question: 'Q2',
      answer: 'A2',
      grounded: false,
      sources: [],
      threadId: first.id,
      agyConversationId: 'conv-2',
    });
    expect(second.id).toBe(first.id);
    expect(second.agyConversationId).toBe('conv-2');

    const messages = await store.getMessages(first.id);
    expect(messages.map((m) => m.content)).toEqual(['Q1', 'A1', 'Q2', 'A2']);
  });

  it('persists grounded on assistant messages even when sources are empty', async () => {
    const store = createMemoryHistoryStore();
    const thread = await store.saveTurn({
      bookHash: 'a',
      bookTitle: 'Alpha',
      question: 'Q',
      answer: 'A',
      grounded: true,
      sources: [],
    });
    await store.saveTurn({
      bookHash: 'a',
      bookTitle: 'Alpha',
      question: 'Follow?',
      answer: 'More',
      grounded: false,
      sources: [],
      threadId: thread.id,
    });
    const messages = await store.getMessages(thread.id);
    const assistants = messages.filter((m) => m.role === 'assistant');
    expect(assistants[0]?.grounded).toBe(true);
    expect(assistants[0]?.sources).toEqual([]);
    expect(assistants[1]?.grounded).toBe(false);
  });

  it('lists recent threads and deletes them', async () => {
    const store = createMemoryHistoryStore();
    const older = await store.saveTurn({
      bookHash: 'a',
      bookTitle: 'Alpha',
      question: 'Older',
      answer: 'A',
      grounded: false,
      sources: [],
    });
    const newer = await store.saveTurn({
      bookHash: 'b',
      bookTitle: 'Beta',
      question: 'Newer',
      answer: 'B',
      grounded: false,
      sources: [],
    });

    const recent = await store.listRecent(1);
    expect(recent).toHaveLength(1);
    expect(recent[0].id).toBe(newer.id);

    await store.deleteThread(newer.id);
    expect(await store.getMessages(newer.id)).toEqual([]);
    expect(await store.listRecent(10).then((t) => t.map((x) => x.id))).toEqual([older.id]);

    expect(await store.getThread(older.id)).toMatchObject({ id: older.id });
    await store.clearAll();
    expect(await store.listRecent(10)).toEqual([]);
    expect(await store.getThread(older.id)).toBeUndefined();
  });
});
