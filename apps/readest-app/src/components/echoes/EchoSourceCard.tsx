'use client';

import React, { useMemo, useState } from 'react';
import clsx from 'clsx';

import { useTranslation } from '@/hooks/useTranslation';
import type { EchoPassage, EchoSource } from '@/services/echoes/types';

/** Rough threshold: if longer than ~3 short lines, offer expand. */
const COLLAPSE_CHAR_HINT = 180;

/**
 * EPUB / LightRAG chunks often ship with hard wraps every ~40–70 chars.
 * Collapse those into a readable block: single newlines → spaces, keep
 * blank lines as paragraph breaks.
 */
export function formatEchoQuoteForDisplay(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .split(/\n\n/)
    .map((para) =>
      para
        .replace(/-\n+(?=\w)/g, '-') // line-broken compounds: "well-\nknown"
        .replace(/\n+/g, ' ')
        .replace(/[ \t]{2,}/g, ' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n\n');
}

export function resolveSourceQuote(
  source: EchoSource,
  passages?: EchoPassage[],
): { preview: string; full: string } {
  const fromPassage = passages?.find((p) => p.id === source.id);
  const full = formatEchoQuoteForDisplay(
    source.content || fromPassage?.content || source.snippet || fromPassage?.snippet || '',
  );
  const preview = formatEchoQuoteForDisplay(source.snippet || fromPassage?.snippet || full);
  return { preview: preview || full, full: full || preview };
}

type EchoSourceCardProps = {
  source: EchoSource;
  passages?: EchoPassage[];
  onOpen?: (bookId?: string | number) => void;
  openDisabled?: boolean;
};

/**
 * Source row: clamped quote by default, expand in place for the full retrieved
 * chunk (often 1–8KB). Prefer full `content` over the 400-char snippet alias.
 */
export const EchoSourceCard: React.FC<EchoSourceCardProps> = ({
  source,
  passages,
  onOpen,
  openDisabled,
}) => {
  const _ = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const { preview, full } = useMemo(() => resolveSourceQuote(source, passages), [source, passages]);
  const canExpand = full.length > COLLAPSE_CHAR_HINT || full.length > preview.length;
  const body = expanded ? full : preview;

  return (
    <li className='eink-bordered border-base-300 rounded-md border px-2 py-2 text-sm'>
      <div className='flex items-start justify-between gap-2'>
        <div className='min-w-0 flex-1'>
          <p className='font-medium'>
            [{source.id}] {source.bookTitle || source.title}
          </p>
          <p
            className={clsx(
              'text-base-content/70 mt-1 text-xs leading-relaxed',
              // Paragraph breaks only (from formatEchoQuoteForDisplay); soft-wrap otherwise.
              'whitespace-pre-line',
              !expanded && 'line-clamp-3',
            )}
          >
            {body}
          </p>
          {canExpand ? (
            <button
              type='button'
              className='btn btn-ghost mt-1 h-7 min-h-7 px-2 text-xs opacity-70'
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
            >
              {expanded ? _('Show less') : _('Show more')}
            </button>
          ) : null}
        </div>
        {onOpen ? (
          <button
            type='button'
            className='btn btn-ghost h-8 min-h-8 shrink-0 px-2 text-xs'
            onClick={() => onOpen(source.bookId)}
            disabled={openDisabled ?? !source.bookId}
          >
            {_('Open')}
          </button>
        ) : null}
      </div>
    </li>
  );
};

export default EchoSourceCard;
