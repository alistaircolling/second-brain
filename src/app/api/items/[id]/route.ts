import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized } from '@/lib/auth';
import { updateItemFields, updateNotionItem } from '@/lib/notion';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const body = await req.json();
  const status = typeof body?.status === 'string' ? body.status.trim() : '';
  const database = typeof body?.database === 'string' ? body.database.trim() : '';
  const title = typeof body?.title === 'string' ? body.title.trim() : undefined;
  const dueDateRaw = body?.dueDate;
  const priorityRaw = body?.priority;
  const tagsRaw = body?.tags;

  const hasStatus = Boolean(status);
  const hasDatabase = ['tasks', 'work', 'people', 'admin'].includes(database);

  if (!hasStatus && !hasDatabase) {
    return NextResponse.json({ error: 'No updates provided.' }, { status: 400 });
  }

  if (hasStatus) {
    await updateNotionItem(params.id, 'status', status);
  }

  if (hasDatabase) {
    const dueDate =
      dueDateRaw === null || dueDateRaw === ''
        ? null
        : typeof dueDateRaw === 'string'
          ? dueDateRaw
          : undefined;
    const priority =
      priorityRaw === null
        ? null
        : typeof priorityRaw === 'number'
          ? priorityRaw
          : undefined;
    const tags = Array.isArray(tagsRaw)
      ? tagsRaw.filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
      : undefined;

    await updateItemFields(params.id, database as any, {
      title,
      dueDate,
      priority,
      tags,
    });
  }

  return NextResponse.json({ ok: true });
}
