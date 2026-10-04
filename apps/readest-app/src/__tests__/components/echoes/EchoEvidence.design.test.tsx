import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EchoConnectionList } from '@/components/echoes/EchoConnectionList';
import { EchoIdeaChips, ideaChipClassName } from '@/components/echoes/EchoIdeaChips';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string, opts?: Record<string, number | string>) => {
    if (opts?.count != null) return key.replace('{{count}}', String(opts.count));
    return key;
  },
}));

afterEach(cleanup);

describe('EchoIdeaChips', () => {
  it('colors chips by idea type and puts description in the tooltip', () => {
    expect(ideaChipClassName('concept')).toContain('border-sky-500');
    expect(ideaChipClassName('person')).toContain('border-amber-500');
    expect(ideaChipClassName('school')).toContain('border-emerald-500');

    render(
      <EchoIdeaChips
        ideas={[
          {
            id: 'i1',
            name: 'Assent',
            type: 'concept',
            description: 'Inner agreement with an impression',
          },
        ]}
      />,
    );

    const chip = screen.getByText('Assent');
    expect(chip.getAttribute('title')).toContain('Inner agreement');
    expect(chip.className).toContain('border-sky-500');
  });
});

describe('EchoConnectionList', () => {
  it('renders compact edges with description tooltips, not a table', () => {
    const { container } = render(
      <EchoConnectionList
        connections={[
          {
            id: 'c1',
            from: 'Assent',
            to: 'Judgement',
            description: 'Assent precedes judgement',
          },
        ]}
      />,
    );

    expect(container.querySelector('table')).toBeNull();
    expect(screen.getByText('Assent')).toBeTruthy();
    expect(screen.getByText('Judgement')).toBeTruthy();
    expect(screen.getByTitle('Assent precedes judgement')).toBeTruthy();
  });

  it('collapses long lists behind Show more', () => {
    const connections = Array.from({ length: 15 }, (_, i) => ({
      id: `c${i}`,
      from: `From${i}`,
      to: `To${i}`,
    }));
    render(<EchoConnectionList connections={connections} initialVisible={3} />);

    expect(screen.getByText('From0')).toBeTruthy();
    expect(screen.queryByText('From14')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show 12 more' }));
    expect(screen.getByText('From14')).toBeTruthy();
  });
});
