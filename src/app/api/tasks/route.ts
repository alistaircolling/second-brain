import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized } from '@/lib/auth';
import { createNotionRecord, getActiveItems } from '@/lib/notion';

const getTitle = (properties: Record<string, any>): string => {
  const title = properties.Title?.title?.[0]?.plain_text || properties.Title?.title?.[0]?.text?.content;
  return title || 'Untitled';
};

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { tasks } = await getActiveItems();

  const items = tasks.map((page: any) => {
    const properties = page.properties || {};

    return {
      id: page.id,
      title: getTitle(properties),
      status: properties.Status?.select?.name || 'To Do',
    };
  });

  return NextResponse.json({ tasks: items });
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = await req.json();
  const title = typeof body?.title === 'string' ? body.title.trim() : '';

  if (!title) {
    return NextResponse.json({ error: 'Title is required.' }, { status: 400 });
  }

  const id = await createNotionRecord('tasks', { title });

  return NextResponse.json({ id });
}
