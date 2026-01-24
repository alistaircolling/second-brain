import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized } from '@/lib/auth';
import { createNotionRecord, getActiveItems } from '@/lib/notion';

type Database = 'tasks' | 'work' | 'people' | 'admin';

const getText = (value: any): string | null =>
  value?.plain_text || value?.text?.content || null;

const getTitle = (properties: Record<string, any>): string => {
  const name = getText(properties.Name?.title?.[0]);
  const followUp = getText(properties['Follow-up']?.rich_text?.[0]);
  if (name && followUp) {
    // Strip action verb from name if it starts with the same verb as followUp to avoid duplication
    const followUpLower = followUp.toLowerCase().trim();
    const nameLower = name.toLowerCase();
    if (nameLower.startsWith(followUpLower + ' ')) {
      const cleanName = name.substring(followUpLower.length + 1).trim();
      return `${followUp} ${cleanName}`;
    }
    return `${followUp} ${name}`;
  }

  const title = getText(properties.Title?.title?.[0]);
  return title || name || 'Untitled';
};

const getTags = (properties: Record<string, any>): string[] =>
  (properties.Tags?.multi_select || []).map((tag: any) => tag.name);

const normalizeItems = (pages: any[], database: Database) =>
  pages.map((page) => {
    const properties = page.properties || {};

    return {
      id: page.id,
      database,
      title: getTitle(properties),
      status: properties.Status?.select?.name || 'To Do',
      dueDate: properties['Due Date']?.date?.start || null,
      priority: properties.Priority?.number || null,
      tags: getTags(properties),
      project: properties.Project?.select?.name || null,
      category: properties.Category?.select?.name || null,
      followUp: getText(properties['Follow-up']?.rich_text?.[0]),
    };
  });

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const items = await getActiveItems();

  const allItems = [
    ...normalizeItems(items.tasks, 'tasks'),
    ...normalizeItems(items.work, 'work'),
    ...normalizeItems(items.people, 'people'),
    ...normalizeItems(items.admin, 'admin'),
  ];

  return NextResponse.json({ items: allItems });
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = await req.json();
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  const destination = body?.destination as Database | undefined;
  const data = body?.data as Record<string, any> | undefined;

  if (!destination || !['tasks', 'work', 'people', 'admin'].includes(destination)) {
    return NextResponse.json({ error: 'Invalid destination.' }, { status: 400 });
  }

  const payload = data
    ? data
    : destination === 'people'
      ? { person_name: title }
      : { title };

  if (!payload.title && !payload.person_name) {
    return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
  }

  const id = await createNotionRecord(destination, payload);

  return NextResponse.json({ id });
}
