import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { EchoConnectionList } from '@/components/echoes/EchoConnectionList';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (value: string) => value,
}));

describe('EchoConnectionList', () => {
  test('prefixes low-confidence edges with Possible', () => {
    render(
      <EchoConnectionList
        connections={[
          { id: 'c1', from: 'Assent', to: 'Judgement', confidence: 0.2 },
          { id: 'c2', from: 'A', to: 'B', confidence: 0.9 },
        ]}
      />,
    );

    expect(screen.getByText(/Possible/)).toBeTruthy();
    expect(screen.getByText('Assent').closest('li')?.textContent).toMatch(/Possible/);
    expect(screen.getByText('A').closest('li')?.textContent).not.toMatch(/Possible/);
  });
});
