/**
 * After a history restore, displaySelection* still holds the restored passage
 * until the next render. A new Ask must pass selection as args into
 * runInitialAsk so runAsk does not see that stale React state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const runAsk = vi.hoisted(() =>
  vi.fn(async () => ({
    answer: 'ok',
    sources: [],
    grounded: false,
    agyConversationId: 'c1',
  })),
);

vi.mock('@/components/Dialog', () => ({
  default: ({ children, isOpen }: { children: ReactNode; isOpen: boolean }) =>
    isOpen ? <div role='dialog'>{children}</div> : null,
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: null }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: {} }),
}));

vi.mock('@/services/ai/ask/askService', () => ({
  runAsk,
  runFollowUp: vi.fn(),
}));

vi.mock('@/services/ai/ask/antigravityClient', () => ({
  completeWithAntigravity: vi.fn(),
}));

vi.mock('@/services/ai/ask/runCommand', () => ({
  tauriRunCommand: vi.fn(),
}));

vi.mock('@/services/ai/lightrag/client', () => ({
  retrieveFromLightRAG: vi.fn(),
}));

vi.mock('@/services/ai/history/historyStore', () => ({
  createPersistentHistoryStore: vi.fn(),
}));

import AskPanel from '@/components/ask/AskPanel';

beforeEach(() => {
  runAsk.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('AskPanel selection args after restore', () => {
  it('uses the new highlight selection, not the restored one, on the next Ask', async () => {
    const restore = {
      threadId: 't-restore',
      messages: [{ id: 'm1', role: 'user' as const, content: 'old Q' }],
      selectionText: 'RESTORED PASSAGE',
      selectionCfi: 'epubcfi(/restored)',
      grounded: false,
    };

    const { rerender } = render(
      <AskPanel
        open
        onClose={() => {}}
        bookHash='h1'
        bookTitle='Book'
        selectionText=''
        mode='ask'
        initialQuestion=''
        threadEpoch={1}
        restore={restore}
      />,
    );

    expect(runAsk).not.toHaveBeenCalled();

    rerender(
      <AskPanel
        open
        onClose={() => {}}
        bookHash='h1'
        bookTitle='Book'
        selectionText='NEW HIGHLIGHT'
        selectionCfi='epubcfi(/new)'
        mode='ask'
        initialQuestion='What does this mean?'
        threadEpoch={2}
        restore={null}
      />,
    );

    await waitFor(() => {
      expect(runAsk).toHaveBeenCalled();
    });

    const calls = runAsk.mock.calls as unknown as Array<
      [{ selectionText: string; selectionCfi?: string; question: string }]
    >;
    expect(calls.length).toBeGreaterThan(0);
    const input = calls[0]![0];
    expect(input.selectionText).toBe('NEW HIGHLIGHT');
    expect(input.selectionCfi).toBe('epubcfi(/new)');
    expect(input.question).toBe('What does this mean?');
  });
});
