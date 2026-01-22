import { NextResponse } from 'next/server';
import { sendEveningDigest } from '@/lib/digest';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await sendEveningDigest();
  return NextResponse.json({ ok: true });
}
