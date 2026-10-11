import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';
import type { BookNote } from '@/types/book';
import { toggleAskReaction } from '@/utils/askRegisterFeedback';

const h = vi.hoisted(() => ({
  updateBooknotes: vi.fn(),
  saveConfig: vi.fn(),
  booknotes: [] as BookNote[],
  toast: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (key: string) => key }));
vi.mock('@/utils/event', () => ({ eventDispatcher: { dispatch: h.toast } }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ envConfig: {} }) }));
vi.mock('@/store/settingsStore', () => ({ useSettingsStore: () => ({ settings: {} }) }));
vi.mock('@/store/bookDataStore', () => ({
  useBookDataStore: () => ({
    getConfig: () => ({ booknotes: h.booknotes }),
    saveConfig: h.saveConfig,
    updateBooknotes: h.updateBooknotes,
  }),
}));

import { useSaveAskRegisterFeedback } from '@/app/reader/hooks/useSaveAskRegisterFeedback';

const makeNote = (overrides: Partial<BookNote> = {}): BookNote => ({
  id: 'n1',
  type: 'annotation',
  cfi: 'epubcfi(/1)',
  note: '',
  createdAt: 1,
  updatedAt: 1000,
  askRegisters: [
    { kind: 'what', text: 'A' },
    { kind: 'how', text: 'B' },
    { kind: 'why', text: 'C' },
    { kind: 'should', text: 'D' },
    { kind: 'argue', text: 'E' },
  ],
  ...overrides,
});

beforeEach(() => {
  vi.resetAllMocks();
  h.booknotes = [makeNote()];
  h.updateBooknotes.mockImplementation((_key: string, booknotes: BookNote[]) => {
    h.booknotes = booknotes;
    return { booknotes };
  });
  h.saveConfig.mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe('useSaveAskRegisterFeedback', () => {
  it('persists the transformed feedback through updateBooknotes + saveConfig', async () => {
    const { result } = renderHook(() => useSaveAskRegisterFeedback('hash-primary'));
    const ok = await result.current('n1', 'should', (f) => toggleAskReaction(f, 'incorrect', 7));
    expect(ok).toBe(true);
    expect(h.updateBooknotes).toHaveBeenCalledTimes(1);
    expect(h.booknotes[0]!.askRegisters![3]!.feedback).toEqual({
      verdict: 'incorrect',
      updatedAt: 7,
    });
    expect(h.saveConfig).toHaveBeenCalledTimes(1);
  });

  it('restores the previous booknotes and toasts when saveConfig rejects', async () => {
    h.saveConfig.mockRejectedValueOnce(new Error('disk full'));
    const { result } = renderHook(() => useSaveAskRegisterFeedback('hash-primary'));
    const ok = await result.current('n1', 'should', (f) => toggleAskReaction(f, 'incorrect', 7));
    expect(ok).toBe(false);
    expect(h.booknotes[0]!.askRegisters![3]!.feedback).toBeUndefined();
    expect(h.toast).toHaveBeenCalledWith(
      'toast',
      expect.objectContaining({
        type: 'error',
        message: 'Failed to save feedback. Please try again.',
      }),
    );
  });
});
