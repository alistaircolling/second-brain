import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized } from '@/lib/auth';
import { updateNotionItem } from '@/lib/notion';

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  const body = await req.json();
  const status = typeof body?.status === 'string' ? body.status.trim() : '';

  if (!status) {
    return NextResponse.json({ error: 'Status is required.' }, { status: 400 });
  }

  await updateNotionItem(params.id, 'status', status);

  return NextResponse.json({ ok: true });
}
