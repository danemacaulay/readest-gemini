import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import NotebookTabNavigation from '@/app/reader/components/notebook/NotebookTabNavigation';

const h = vi.hoisted(() => ({ aiEnabled: false }));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: {} }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: { aiSettings: { enabled: h.aiEnabled } } }),
}));

beforeEach(() => {
  h.aiEnabled = false;
});

afterEach(cleanup);

describe('NotebookTabNavigation design regression', () => {
  it('shows only Notes when AI Assistant is disabled', () => {
    render(<NotebookTabNavigation activeTab='notes' onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Notes' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'AI' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Echoes' })).toBeNull();
  });

  it('shows Notes and AI when AI is enabled, without Echoes', () => {
    h.aiEnabled = true;
    render(<NotebookTabNavigation activeTab='notes' onTabChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Notes' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'AI' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Echoes' })).toBeNull();
  });
});
