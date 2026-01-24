import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized } from '@/lib/auth';
import { getTagOptions } from '@/lib/notion';

const DATABASES = ['tasks', 'work', 'people', 'admin'] as const;

export async function GET(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const database = searchParams.get('database');

  if (!database || !DATABASES.includes(database as any)) {
    return NextResponse.json({ error: 'Invalid database.' }, { status: 400 });
  }

  const tags = await getTagOptions(database as any);

  return NextResponse.json({ tags });
}
