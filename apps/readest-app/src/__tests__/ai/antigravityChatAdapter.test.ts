import { describe, it, expect, vi } from 'vitest';
import { DEFAULT_AI_SETTINGS } from '@/services/ai/constants';
import type { AISettings } from '@/services/ai/types';
import {
  buildAntigravityPrompt,
  createAntigravityChatAdapter,
} from '@/services/ai/adapters/AntigravityChatAdapter';
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

describe('buildAntigravityPrompt', () => {
  it('includes LightRAG base URL and mode in instructions', () => {
    const prompt = buildAntigravityPrompt({
      bookTitle: 'Dune',
      authorName: 'Herbert',
      lightragBaseUrl: 'http://127.0.0.1:8765/',
      lightragMode: 'hybrid',
      messages: [{ role: 'user', content: 'Who is Paul?' }],
      resumeConversation: false,
    });
    expect(prompt).toContain("curl -sS -m 3 -X POST 'http://127.0.0.1:8765/api/retrieve'");
    expect(prompt).toContain('"mode":"hybrid"');
    expect(prompt).toContain('Do not search the filesystem');
    expect(prompt).toContain('Dune');
    expect(prompt).toContain('Who is Paul?');
  });

  it('on resume only includes the latest user turn after instructions', () => {
    const prompt = buildAntigravityPrompt({
      bookTitle: 'Dune',
      authorName: '',
      lightragBaseUrl: 'http://127.0.0.1:8765',
      lightragMode: 'local',
      messages: [
        { role: 'user', content: 'First' },
        { role: 'assistant', content: 'Answer' },
        { role: 'user', content: 'Follow up' },
      ],
      resumeConversation: true,
    });
    expect(prompt).toContain('User:\nFollow up');
    expect(prompt).not.toContain('First');
    expect(prompt).toContain('"mode":"local"');
  });
});

describe('createAntigravityChatAdapter', () => {
  const settings: AISettings = {
    ...DEFAULT_AI_SETTINGS,
    enabled: true,
    agyPath: 'agy',
    lightragBaseUrl: 'http://127.0.0.1:8765',
    lightragMode: 'hybrid',
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
      agyConversationId: null,
      onAgyConversationId,
      runCommand,
    }));

    const chunks = await drain(adapter.run(makeRunOpts([textMessage('user', 'Hi')])));

    expect(seenPrompt).toContain("curl -sS -m 3 -X POST 'http://127.0.0.1:8765/api/retrieve'");
    expect(seenPrompt).toContain('Do not search the filesystem');
    expect(seenArgs).toContain('--dangerously-skip-permissions');
    expect(seenArgs).toContain('--sandbox');
    expect(onAgyConversationId).toHaveBeenCalledWith('agy-1');
    expect(chunks.at(-1)?.content?.[0]?.text).toBe('Hello');
    expect(chunks.at(-1)?.status?.type).toBe('complete');
  });

  it('passes --conversation on follow-up when agyConversationId is set', async () => {
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
      authorName: '',
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
    const prompt = String(seenArgs[1] ?? '');
    expect(prompt).toContain('Second');
    expect(prompt).not.toContain('First');
  });
});
