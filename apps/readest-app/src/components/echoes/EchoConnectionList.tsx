'use client';

import React from 'react';
import clsx from 'clsx';

import { useTranslation } from '@/hooks/useTranslation';
import type { EchoConnection } from '@/services/echoes/types';

type EchoConnectionListProps = {
  connections: EchoConnection[];
  className?: string;
  /** Soft cap for the notebook column; remainder stays available via expand. */
  initialVisible?: number;
};

/**
 * Compact relationship edges — not a table. One line per link; description on hover.
 */
export const EchoConnectionList: React.FC<EchoConnectionListProps> = ({
  connections,
  className,
  initialVisible = 12,
}) => {
  const _ = useTranslation();
  const [expanded, setExpanded] = React.useState(false);
  if (connections.length === 0) return null;

  const visible = expanded ? connections : connections.slice(0, initialVisible);
  const canCollapse = connections.length > initialVisible;

  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      <ul className='flex flex-col gap-1'>
        {visible.map((edge) => {
          const tip = edge.description?.trim() || `${edge.from} → ${edge.to}`;
          return (
            <li
              key={edge.id}
              title={tip}
              className='text-base-content/85 hover:bg-base-200/60 flex min-w-0 items-baseline gap-1.5 rounded px-1 py-0.5 text-xs leading-snug'
            >
              <span className='truncate font-medium'>{edge.from}</span>
              <span className='text-base-content/35 shrink-0' aria-hidden>
                →
              </span>
              <span className='truncate font-medium'>{edge.to}</span>
            </li>
          );
        })}
      </ul>
      {canCollapse ? (
        <button
          type='button'
          className='btn btn-ghost h-7 min-h-7 self-start px-2 text-xs opacity-70'
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded
            ? _('Show less')
            : _('Show {{count}} more', { count: connections.length - initialVisible })}
        </button>
      ) : null}
    </div>
  );
};

export default EchoConnectionList;
