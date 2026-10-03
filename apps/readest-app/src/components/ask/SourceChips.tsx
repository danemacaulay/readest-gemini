import type { LightRAGSource } from '@/services/ai/lightrag/types';
import { useTranslation } from '@/hooks/useTranslation';

export function SourceChips({ sources }: { sources: LightRAGSource[] }) {
  const _ = useTranslation();
  if (!sources.length) {
    return <p className='text-sm opacity-70'>{_('No library sources')}</p>;
  }
  return (
    <ul className='flex flex-wrap gap-2'>
      {sources.map((s) => (
        <li key={s.id} title={s.snippet} className='rounded border px-2 py-1 text-xs'>
          [{s.id}] {s.title}
        </li>
      ))}
    </ul>
  );
}
