import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import type { AISettings } from '@/services/ai/types';
import {
  buildAntigravityPrompt,
  createAntigravityChatAdapter,
} from '@/services/ai/adapters/AntigravityChatAdapter';
import { formatBookMetadataPack } from '@/services/ai/adapters/bookContext';
import type { RunCommand } from '@/services/ai/ask/antigravityClient';

function textMessage(role: 'user' | 'assistant', text: string) {
  return {
    role,
    content: [{ type: 'text' as const, text }],
    id: `${role}-${text.slice(0, 8)}`,
    createdAt: new Date(),
  };
}

async function drain(
  runResult: AsyncGenerator<unknown> | Promise<unknown>,
): Promise<Array<{ content?: Array<{ type: string; text?: string }>; status?: { type: string } }>> {
  const out: Array<{
    content?: Array<{ type: string; text?: string }>;
    status?: { type: string };
  }> = [];
  const gen = await runResult;
  if (gen && typeof (gen as AsyncGenerator<unknown>)[Symbol.asyncIterator] === 'function') {
    for await (const chunk of gen as AsyncGenerator<unknown>) {
      out.push(chunk as (typeof out)[number]);
    }
  } else {
    out.push(gen as (typeof out)[number]);
  }
  return out;
}

function makeRunOpts(messages: ReturnType<typeof textMessage>[]) {
  return {
    messages,
    abortSignal: new AbortController().signal,
    runConfig: {},
    context: {},
    config: {},
    unstable_getMessage: () => messages[0]!,
  } as never;
}

const samplePack = formatBookMetadataPack({
  title: 'Dune',
  author: 'Herbert',
  tags: ['sci-fi'],
  description: 'Desert planet epic.',
});

describe('buildAntigravityPrompt', () => {
  it('allows web search, forbids filesystem, and omits LightRAG/curl', () => {
    const prompt = buildAntigravityPrompt({
      bookTitle: 'Dune',
      authorName: 'Herbert',
      bookContextPack: samplePack,
      includeBookContext: true,
      messages: [{ role: 'user', content: 'Who is Paul?' }],
      resumeConversation: false,
    });
    expect(prompt).toContain('web search');
    expect(prompt).toMatch(/filesystem/i);
    expect(prompt.toLowerCase()).not.toContain('lightrag');
    expect(prompt).not.toContain('/api/retrieve');
    expect(prompt).not.toContain('curl');
    expect(prompt).toContain('Dune');
    expect(prompt).toContain('Who is Paul?');
  });

  it('includes metadata pack when includeBookContext is true', () => {
    const prompt = buildAntigravityPrompt({
      bookTitle: 'Dune',
      authorName: 'Herbert',
      bookContextPack: samplePack,
      includeBookContext: true,
      messages: [{ role: 'user', content: 'Hi' }],
      resumeConversation: false,
    });
    expect(prompt).toContain('Book details:');
    expect(prompt).toContain('Title: Dune');
    expect(prompt).toContain('Tags: sci-fi');
    expect(prompt).toContain('Description: Desert planet epic.');
  });

  it('omits Description/Tags pack when includeBookContext is false', () => {
    const prompt = buildAntigravityPrompt({
      bookTitle: 'Dune',
      authorName: 'Herbert',
      bookContextPack: samplePack,
      includeBookContext: false,
      messages: [{ role: 'user', content: 'Hi' }],
      resumeConversation: false,
    });
    expect(prompt).not.toContain('Book details:');
    expect(prompt).not.toContain('Description: Desert planet epic.');
    expect(prompt).not.toContain('Tags: sci-fi');
  });

  it('on resume only includes the latest user turn and omits metadata pack', () => {
    const prompt = buildAntigravityPrompt({
      bookTitle: 'Dune',
      authorName: '',
      bookContextPack: samplePack,
      includeBookContext: false,
      messages: [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Answer' },
        { role: 'user', content: 'Follow up' },
      ],
      resumeConversation: true,
    });
    expect(prompt).toContain('User:\nFollow up');
    expect(prompt).not.toContain('First');
    expect(prompt).not.toContain('Book details:');
    expect(prompt).not.toContain('Description: Desert planet epic.');
    expect(prompt).not.toContain('Tags: sci-fi');
    expect(prompt.toLowerCase()).not.toContain('lightrag');
    expect(prompt).not.toContain('curl');
  });
});

describe('createAntigravityChatAdapter', () => {
  const settings: AISettings = {
    ...DEFAULT_AI_SETTINGS,
    enabled: true,
    agyPath: 'agy',
  };

  it('calls completeWithAntigravity, emits text, and stores conversation id', async () => {
    let seenArgs: string[] = [];
    let seenPrompt = '';
    const runCommand: RunCommand = async (_cmd, args) => {
      seenArgs = args;
      seenPrompt = String(args[1] ?? '');
      return {
        code: 0,
        stdout:
          '{"event":"result","result":{"conversation_id":"agy-1","status":"SUCCESS","response":"Hello\\n"}}\n',
        stderr: '',
      };
    };
    const onAgyConversationId = vi.fn();

    const adapter = createAntigravityChatAdapter(() => ({
      settings,
      bookTitle: 'Dune',
      authorName: 'Herbert',
      bookContext: {
        title: 'Dune',
        author: 'Herbert',
        tags: ['sci-fi'],
        description: 'Desert planet epic.',
      },
      agyConversationId: null,
      onAgyConversationId,
      runCommand,
    }));

    const chunks = await drain(adapter.run(makeRunOpts([textMessage('user', 'Hi')])));

    expect(seenPrompt).toContain('web search');
    expect(seenPrompt).toMatch(/filesystem/i);
    expect(seenPrompt).toContain('Title: Dune');
    expect(seenPrompt).toContain('Tags: sci-fi');
    expect(seenPrompt.toLowerCase()).not.toContain('lightrag');
    expect(seenPrompt).not.toContain('/api/retrieve');
    expect(seenPrompt).not.toContain('curl');
    expect(seenArgs).toContain('--dangerously-skip-permissions');
    expect(seenArgs).toContain('--sandbox');
    expect(onAgyConversationId).toHaveBeenCalledWith('agy-1');
    expect(chunks.at(-1)?.content?.[0]?.text).toBe('Hello');
    expect(chunks.at(-1)?.status?.type).toBe('complete');
  });

  it('passes --conversation on follow-up and omits metadata pack', async () => {
    let seenArgs: string[] = [];
    const runCommand: RunCommand = async (_cmd, args) => {
      seenArgs = args;
      return {
        code: 0,
        stdout:
          '{"event":"result","result":{"conversation_id":"agy-1","status":"SUCCESS","response":"OK"}}\n',
        stderr: '',
      };
    };

    const adapter = createAntigravityChatAdapter(() => ({
      settings,
      bookTitle: 'Dune',
      authorName: 'Herbert',
      bookContext: {
        title: 'Dune',
        author: 'Herbert',
        tags: ['sci-fi'],
        description: 'Desert planet epic.',
      },
      agyConversationId: 'agy-1',
      runCommand,
    }));

    await drain(
      adapter.run(
        makeRunOpts([
          textMessage('user', 'First'),
          textMessage('assistant', 'A'),
          textMessage('user', 'Second'),
        ]),
      ),
    );

    expect(seenArgs).toContain('--conversation');
    expect(seenArgs).toContain('agy-1');
    expect(seenArgs).toContain('--dangerously-skip-permissions');
    expect(seenArgs).toContain('--sandbox');
    const prompt = String(seenArgs[1] ?? '');
    expect(prompt).toContain('Second');
    expect(prompt).not.toContain('First');
    expect(prompt).not.toContain('Book details:');
    expect(prompt).not.toContain('Description: Desert planet epic.');
    expect(prompt).not.toContain('Tags: sci-fi');
  });
});
