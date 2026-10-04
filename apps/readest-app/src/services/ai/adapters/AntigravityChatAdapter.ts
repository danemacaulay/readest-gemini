import type { ChatModelAdapter, ChatModelRunResult } from '@assistant-ui/react';
import {
  AntigravityAuthError,
  AntigravityExitError,
  AntigravityNotFoundError,
  AntigravityTimeoutError,
  completeWithAntigravity,
  type RunCommand,
} from '../ask/antigravityClient';
import { aiLogger } from '../logger';
import type { AISettings } from '../types';
import { formatBookMetadataPack, type BookContextInput } from './bookContext';

export type AntigravityAdapterOptions = {
  settings: AISettings;
  bookTitle: string;
  authorName: string;
  bookContext?: BookContextInput;
  /** Stored Antigravity conversation id for follow-ups. */
  agyConversationId?: string | null;
  /** Persist a new/updated agy conversation id after a successful turn. */
  onAgyConversationId?: (id: string) => void;
  runCommand: RunCommand;
};

/** Exported for unit tests — builds the instruction + user prompt for agy. */
export function buildAntigravityPrompt(opts: {
  bookTitle: string;
  authorName: string;
  bookContextPack?: string;
  includeBookContext: boolean;
  messages: Array<{ role: string; content: string }>;
  resumeConversation: boolean;
}): string {
  const authorLine = opts.authorName?.trim() ? ` by ${opts.authorName.trim()}` : '';
  const parts = [
    `You are a reading assistant helping with "${opts.bookTitle}"${authorLine}.`,
    '',
    'Rules:',
    '- You may use web search when it improves the answer.',
    '- Do not search the local filesystem, do not run find/grep/ls over the home directory, and do not open book files from disk.',
    '- Prefer a direct answer; keep tool use light.',
    '',
  ];
  if (opts.includeBookContext && opts.bookContextPack?.trim()) {
    parts.push('Book details:', opts.bookContextPack.trim(), '');
  }
  if (opts.resumeConversation) {
    const lastUser = [...opts.messages].reverse().find((m) => m.role === 'user');
    parts.push(`User:\n${lastUser?.content?.trim() || ''}`);
  } else {
    const transcript = opts.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    parts.push(`Conversation:\n${transcript}`);
  }
  return parts.join('\n');
}

function mapAgyError(err: unknown): string {
  if (err instanceof AntigravityNotFoundError) return err.message;
  if (err instanceof AntigravityAuthError) return err.message;
  if (err instanceof AntigravityTimeoutError) return err.message;
  if (err instanceof AntigravityExitError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

export function createAntigravityChatAdapter(
  getOptions: () => AntigravityAdapterOptions,
): ChatModelAdapter {
  return {
    async *run({ messages, abortSignal }): AsyncGenerator<ChatModelRunResult> {
      const options = getOptions();
      const {
        settings,
        bookTitle,
        authorName,
        bookContext,
        agyConversationId,
        onAgyConversationId,
        runCommand,
      } = options;

      const aiMessages = messages.map((m) => ({
        role: m.role as string,
        content: m.content
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n'),
      }));

      const lastUser =
        [...aiMessages]
          .reverse()
          .find((m) => m.role === 'user')
          ?.content?.trim() || '';
      aiLogger.chat.send(lastUser.length, false);

      if (abortSignal?.aborted) {
        yield {
          content: [{ type: 'text', text: '' }],
          status: { type: 'incomplete', reason: 'cancelled' },
        };
        return;
      }

      const resumeConversation = Boolean(agyConversationId);
      const includeBookContext = !resumeConversation;
      const bookContextPack = formatBookMetadataPack(
        bookContext ?? { title: bookTitle, author: authorName },
      );
      const prompt = buildAntigravityPrompt({
        bookTitle,
        authorName,
        bookContextPack,
        includeBookContext,
        messages: aiMessages,
        resumeConversation,
      });

      try {
        const result = await completeWithAntigravity(prompt, {
          agyPath: settings.agyPath || 'agy',
          runCommand,
          conversationId: agyConversationId || undefined,
          sandbox: true,
          skipPermissions: true,
        });

        if (abortSignal?.aborted) {
          yield {
            content: [{ type: 'text', text: result.text || '' }],
            status: { type: 'incomplete', reason: 'cancelled' },
          };
          return;
        }

        if (result.conversationId) {
          onAgyConversationId?.(result.conversationId);
        }

        yield {
          content: [{ type: 'text', text: result.text || '' }],
          status: { type: 'complete', reason: 'stop' },
        };
      } catch (err) {
        if (abortSignal?.aborted) {
          yield {
            content: [{ type: 'text', text: '' }],
            status: { type: 'incomplete', reason: 'cancelled' },
          };
          return;
        }
        const message = mapAgyError(err);
        aiLogger.chat.error(message);
        yield {
          content: [{ type: 'text', text: message }],
          status: { type: 'incomplete', reason: 'error', error: message },
        };
      }
    },
  };
}
