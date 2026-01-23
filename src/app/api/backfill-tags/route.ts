import { NextResponse } from 'next/server';
import { backfillTagsForActiveItems } from '@/lib/backfillTags';

export async function POST(req: Request) {
  const secret = process.env.BACKFILL_SECRET || process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'BACKFILL_SECRET or CRON_SECRET not configured' },
      { status: 501 }
    );
  }

  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const stats = await backfillTagsForActiveItems();
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json(
      { error: 'Backfill failed' },
      { status: 500 }
    );
  }
}
