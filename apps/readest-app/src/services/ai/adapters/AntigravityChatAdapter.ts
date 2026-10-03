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

export interface AntigravityAdapterOptions {
  settings: AISettings;
  bookTitle: string;
  authorName: string;
  /** Stored Antigravity conversation id for follow-ups. */
  agyConversationId?: string | null;
  /** Persist a new/updated agy conversation id after a successful turn. */
  onAgyConversationId?: (id: string) => void;
  runCommand: RunCommand;
}

/** Exported for unit tests — builds the instruction + user prompt for agy. */
export function buildAntigravityPrompt(opts: {
  bookTitle: string;
  authorName: string;
  lightragBaseUrl: string;
  lightragMode: string;
  messages: Array<{ role: string; content: string }>;
  /** When resuming an agy conversation, only the latest user turn is needed. */
  resumeConversation: boolean;
}): string {
  const baseUrl = (opts.lightragBaseUrl || 'http://127.0.0.1:8765').replace(/\/$/, '');
  const mode = opts.lightragMode || 'hybrid';
  const authorLine = opts.authorName?.trim() ? ` by ${opts.authorName.trim()}` : '';

  const instructions = [
    `You are a reading assistant helping with "${opts.bookTitle}"${authorLine}.`,
    '',
    "When library or cross-book context from the user's Calibre LightRAG index would help, retrieve it yourself before answering:",
    `POST ${baseUrl}/api/retrieve`,
    'Content-Type: application/json',
    `Body: {"query":"<search query>","mode":"${mode}"}`,
    'Use contextText / sources from the JSON response to ground your answer. Do not invent citations.',
    'If the retrieve server is unreachable, answer without library context and say so briefly.',
    '',
  ].join('\n');

  if (opts.resumeConversation) {
    const lastUser = [...opts.messages].reverse().find((m) => m.role === 'user');
    return `${instructions}User:\n${lastUser?.content?.trim() || ''}`;
  }

  const transcript = opts.messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  return `${instructions}Conversation:\n${transcript}`;
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
      const prompt = buildAntigravityPrompt({
        bookTitle,
        authorName,
        lightragBaseUrl: settings.lightragBaseUrl,
        lightragMode: settings.lightragMode,
        messages: aiMessages,
        resumeConversation,
      });

      try {
        const result = await completeWithAntigravity(prompt, {
          agyPath: settings.agyPath || 'agy',
          runCommand,
          conversationId: agyConversationId || undefined,
          // Allow HTTP to local lib-rag (sandbox blocks network/tools).
          sandbox: false,
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
