import { getActiveItems, updatePageTags } from '@/lib/notion';

const TAG_KEYWORDS: Record<string, string[]> = {
  phone: ['call', 'phone', 'ring', 'callback'],
  laptop: ['email', 'message', 'dm', 'online', 'computer', 'laptop'],
  groceries: ['groceries', 'grocery', 'food', 'milk', 'supermarket'],
  home: ['home', 'diy', 'clean', 'household', 'house'],
  office: ['office'],
  errands: ['errands', 'pick up', 'collect', 'bank'],
};

const inferTags = (text: string): string[] => {
  const lower = text.toLowerCase();
  const tags: string[] = [];
  for (const [tag, keywords] of Object.entries(TAG_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(kw))) tags.push(tag);
  }
  return Array.from(new Set(tags));
};

const getItemTitle = (item: any): string => {
  const name = item.properties.Name?.title?.[0]?.text?.content;
  const followUp = item.properties['Follow-up']?.rich_text?.[0]?.text?.content;
  if (name && followUp) return `${followUp} ${name}`;
  return item.properties.Title?.title?.[0]?.text?.content || name || '';
};

export type PreviewItem = { id: string; title: string; tags: string[] };

export const previewBackfillTags = async (): Promise<{ items: PreviewItem[] }> => {
  const { tasks, work, people, admin } = await getActiveItems();
  const all = [...tasks, ...work, ...people, ...admin];
  const items: PreviewItem[] = [];

  for (const item of all) {
    const existing = item.properties.Tags?.multi_select || [];
    if (existing.length > 0) continue;

    const title = getItemTitle(item);
    if (!title) continue;

    const tags = inferTags(title);
    if (tags.length === 0) continue;

    items.push({ id: item.id, title, tags });
  }

  return { items };
};

export const backfillTagsForActiveItems = async (): Promise<{
  updated: number;
  skipped: number;
  errors: number;
}> => {
  const { tasks, work, people, admin } = await getActiveItems();
  const all = [...tasks, ...work, ...people, ...admin];
  let updated = 0,
    skipped = 0,
    errors = 0;

  for (const item of all) {
    const existing = item.properties.Tags?.multi_select || [];
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    const title = getItemTitle(item);
    if (!title) {
      skipped++;
      continue;
    }

    const tags = inferTags(title);
    if (tags.length === 0) {
      skipped++;
      continue;
    }

    try {
      await updatePageTags(item.id, tags);
      updated++;
    } catch {
      errors++;
    }
  }

  return { updated, skipped, errors };
};
