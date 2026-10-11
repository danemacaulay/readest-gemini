import { describe, expect, it } from 'vitest';
import {
  META_WILL_SECTION_IDS,
  META_WILL_SECTION_LABELS,
  appendMetaWillLink,
  composeMetaWillNote,
  createEmptyMetaWill,
  getReadingIntention,
  removeMetaWillLink,
} from '@/utils/metaWill';

describe('metaWill helpers', () => {
  it('seeds five empty sections in canonical order', () => {
    const m = createEmptyMetaWill();
    expect(m.sections.map((s) => s.id)).toEqual([...META_WILL_SECTION_IDS]);
    expect(m.sections.every((s) => s.text === '' && s.links.length === 0)).toBe(true);
  });

  it('getReadingIntention trims why or returns null', () => {
    const m = createEmptyMetaWill();
    expect(getReadingIntention(m)).toBeNull();
    m.sections[0]!.text = '  for leadership  ';
    expect(getReadingIntention(m)).toBe('for leadership');
    expect(getReadingIntention(undefined)).toBeNull();
  });

  it('composeMetaWillNote uses exact heading labels', () => {
    const m = createEmptyMetaWill();
    m.sections[0]!.text = 'Intent';
    const body = composeMetaWillNote(m);
    for (const id of META_WILL_SECTION_IDS) {
      expect(body).toContain(`## ${META_WILL_SECTION_LABELS[id]}`);
    }
    expect(body).toContain('Intent');
  });

  it('append is idempotent per section; remove does not delete other sections’ links', () => {
    let m = createEmptyMetaWill();
    const link = { booknoteId: 'a1', excerpt: 'hi', chapterLabel: 'Ch 1' };
    m = appendMetaWillLink(m, 'take', link);
    m = appendMetaWillLink(m, 'take', link);
    expect(m.sections.find((s) => s.id === 'take')!.links).toHaveLength(1);
    m = appendMetaWillLink(m, 'refuse', link);
    m = removeMetaWillLink(m, 'take', 'a1');
    expect(m.sections.find((s) => s.id === 'take')!.links).toHaveLength(0);
    expect(m.sections.find((s) => s.id === 'refuse')!.links).toHaveLength(1);
  });
});
