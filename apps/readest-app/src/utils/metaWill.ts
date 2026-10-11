import type { BookNote, MetaWill, MetaWillNoteLink, MetaWillSectionId } from '@/types/book';

export const META_WILL_SECTION_IDS = [
  'why',
  'shifted',
  'take',
  'refuse',
  'open',
] as const satisfies readonly MetaWillSectionId[];

export const META_WILL_SECTION_LABELS: Record<MetaWillSectionId, string> = {
  why: 'Why I read it',
  shifted: 'What shifted',
  take: 'What I take',
  refuse: 'What I refuse',
  open: 'Still open',
};

export function createEmptyMetaWill(): MetaWill {
  return {
    sections: META_WILL_SECTION_IDS.map((id) => ({
      id,
      text: '',
      links: [],
    })),
  };
}

export function shouldSeedMetaWill(notebook: BookNote | null): boolean {
  return !notebook?.metaWill && !notebook?.note.trim();
}

export function getReadingIntention(metaWill: MetaWill | undefined | null): string | null {
  if (!metaWill) return null;
  const trimmed = metaWill.sections.find((s) => s.id === 'why')?.text.trim();
  return trimmed || null;
}

export function composeMetaWillNote(metaWill: MetaWill): string {
  return metaWill.sections
    .map((section) => {
      const label = META_WILL_SECTION_LABELS[section.id];
      let block = `## ${label}\n\n${section.text}\n`;
      for (const link of section.links) {
        const chapter = link.chapterLabel ?? '';
        const excerpt = link.excerpt ?? '';
        block += `- ${chapter}: ${excerpt}\n`;
      }
      return block;
    })
    .join('\n');
}

function mapSections(
  metaWill: MetaWill,
  mapFn: (section: MetaWill['sections'][number]) => MetaWill['sections'][number],
): MetaWill {
  return { sections: metaWill.sections.map(mapFn) };
}

export function appendMetaWillLink(
  metaWill: MetaWill,
  sectionId: MetaWillSectionId,
  link: MetaWillNoteLink,
): MetaWill {
  return mapSections(metaWill, (section) => {
    if (section.id !== sectionId) return section;
    if (section.links.some((l) => l.booknoteId === link.booknoteId)) {
      return section;
    }
    return { ...section, links: [...section.links, link] };
  });
}

export function removeMetaWillLink(
  metaWill: MetaWill,
  sectionId: MetaWillSectionId,
  booknoteId: string,
): MetaWill {
  return mapSections(metaWill, (section) => {
    if (section.id !== sectionId) return section;
    return {
      ...section,
      links: section.links.filter((l) => l.booknoteId !== booknoteId),
    };
  });
}

export function groupAnnotateNotesByChapter(
  notes: BookNote[],
  resolveChapter: (note: BookNote) => { href: string; label: string },
): { href: string; label: string; notes: BookNote[] }[] {
  const groups: { href: string; label: string; notes: BookNote[] }[] = [];
  const indexByHref = new Map<string, number>();

  for (const note of notes) {
    const { href, label } = resolveChapter(note);
    const existing = indexByHref.get(href);
    if (existing !== undefined) {
      groups[existing]!.notes.push(note);
    } else {
      indexByHref.set(href, groups.length);
      groups.push({ href, label, notes: [note] });
    }
  }

  return groups;
}
