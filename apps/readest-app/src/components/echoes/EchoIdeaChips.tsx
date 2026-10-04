'use client';

import React from 'react';
import clsx from 'clsx';

import type { EchoIdea } from '@/services/echoes/types';

export function ideaChipClassName(type?: string): string {
  const kind = (type || '').toLowerCase();
  return clsx(
    'badge badge-outline badge-sm eink-bordered max-w-full truncate font-normal',
    kind === 'concept' && 'border-sky-500/45 text-sky-800 dark:text-sky-300',
    kind === 'person' && 'border-amber-500/45 text-amber-900 dark:text-amber-300',
    (kind === 'school' || kind === 'organization') &&
      'border-emerald-500/45 text-emerald-900 dark:text-emerald-300',
    !['concept', 'person', 'school', 'organization'].includes(kind) && 'text-base-content/80',
  );
}

function ideaTooltip(idea: EchoIdea): string {
  const parts = [idea.name];
  if (idea.type) parts.push(idea.type);
  if (idea.description?.trim()) parts.push(idea.description.trim());
  return parts.join(' — ');
}

type EchoIdeaChipsProps = {
  ideas: EchoIdea[];
  className?: string;
};

/**
 * Dense type-colored idea chips. Description lives in the native tooltip so the
 * notebook column stays scannable.
 */
export const EchoIdeaChips: React.FC<EchoIdeaChipsProps> = ({ ideas, className }) => {
  if (ideas.length === 0) return null;
  return (
    <ul className={clsx('flex flex-wrap gap-1.5', className)} role='list'>
      {ideas.map((idea) => (
        <li key={idea.id} className='max-w-full'>
          <span className={ideaChipClassName(idea.type)} title={ideaTooltip(idea)}>
            {idea.name}
          </span>
        </li>
      ))}
    </ul>
  );
};

export default EchoIdeaChips;
