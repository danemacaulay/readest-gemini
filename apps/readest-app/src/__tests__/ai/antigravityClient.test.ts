import { describe, it, expect } from 'vitest';
import { extractAnswerFromAgyOutput } from '../../services/ai/ask/antigravityClient';

describe('extractAnswerFromAgyOutput', () => {
  it('returns plain text when output is not JSON', () => {
    expect(extractAnswerFromAgyOutput('Hello reader')).toEqual({
      text: 'Hello reader',
      conversationId: undefined,
    });
  });

  it('extracts response + conversation_id from stream-json result event', () => {
    const stdout = [
      '{"event":"init","conversation_id":"c1"}',
      '{"event":"result","result":{"conversation_id":"c1","status":"SUCCESS","response":"Final answer\\n"}}',
    ].join('\n');
    expect(extractAnswerFromAgyOutput(stdout)).toEqual({
      text: 'Final answer',
      conversationId: 'c1',
    });
  });
});

describe('completeWithAntigravity', () => {
  it('completeWithAntigravity returns text + conversationId and passes --conversation', async () => {
    const { completeWithAntigravity } = await import('../../services/ai/ask/antigravityClient');
    let seenArgs: string[] = [];
    const out = await completeWithAntigravity('Follow up?', {
      agyPath: '/usr/local/bin/agy',
      conversationId: 'c1',
      runCommand: async (_cmd, args) => {
        seenArgs = args;
        return {
          code: 0,
          stdout:
            '{"event":"result","result":{"conversation_id":"c1","status":"SUCCESS","response":"OK\\n"}}\n',
          stderr: '',
        };
      },
    });
    expect(out.text).toBe('OK');
    expect(out.conversationId).toBe('c1');
    expect(seenArgs).toContain('--conversation');
    expect(seenArgs).toContain('c1');
    expect(seenArgs).toContain('--sandbox');
  });

  it('omits --sandbox and adds --dangerously-skip-permissions when configured', async () => {
    const { completeWithAntigravity } = await import('../../services/ai/ask/antigravityClient');
    let seenArgs: string[] = [];
    await completeWithAntigravity('Q', {
      agyPath: 'agy',
      sandbox: false,
      skipPermissions: true,
      runCommand: async (_cmd, args) => {
        seenArgs = args;
        return {
          code: 0,
          stdout: '{"event":"result","result":{"status":"SUCCESS","response":"OK"}}\n',
          stderr: '',
        };
      },
    });
    expect(seenArgs).not.toContain('--sandbox');
    expect(seenArgs).toContain('--dangerously-skip-permissions');
  });

  it('forwards abortSignal to runCommand opts', async () => {
    const { completeWithAntigravity } = await import('../../services/ai/ask/antigravityClient');
    const controller = new AbortController();
    let seenSignal: AbortSignal | undefined;
    await completeWithAntigravity('Q', {
      agyPath: 'agy',
      abortSignal: controller.signal,
      runCommand: async (_cmd, _args, opts) => {
        seenSignal = opts.signal;
        return {
          code: 0,
          stdout: '{"event":"result","result":{"status":"SUCCESS","response":"OK"}}\n',
          stderr: '',
        };
      },
    });
    expect(seenSignal).toBe(controller.signal);
  });
});
