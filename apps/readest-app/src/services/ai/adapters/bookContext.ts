export type BookContextInput = {
  title?: string;
  author?: string;
  tags?: string[];
  series?: string;
  seriesIndex?: number;
  publisher?: string;
  published?: string;
  subjects?: string | string[];
  description?: string;
};

export function formatBookMetadataPack(input: BookContextInput, maxChars = 1800): string {
  const subjects = Array.isArray(input.subjects) ? input.subjects.join(', ') : input.subjects || '';
  const lines: string[] = [];
  if (input.title?.trim()) lines.push(`Title: ${input.title.trim()}`);
  if (input.author?.trim()) lines.push(`Author: ${input.author.trim()}`);
  if (input.tags?.length) lines.push(`Tags: ${input.tags.join(', ')}`);
  if (input.series?.trim()) {
    const idx = typeof input.seriesIndex === 'number' ? ` (#${input.seriesIndex})` : '';
    lines.push(`Series: ${input.series.trim()}${idx}`);
  }
  if (input.publisher?.trim()) lines.push(`Publisher: ${input.publisher.trim()}`);
  if (input.published?.trim()) lines.push(`Published: ${input.published.trim()}`);
  if (subjects.trim()) lines.push(`Subjects: ${subjects.trim()}`);
  if (input.description?.trim()) lines.push(`Description: ${input.description.trim()}`);
  let text = lines.join('\n');
  if (text.length > maxChars) text = `${text.slice(0, Math.max(0, maxChars - 1))}…`;
  return text;
}
