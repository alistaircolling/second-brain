import { NextResponse } from 'next/server';
import { sendMorningDigest } from '@/lib/digest';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await sendMorningDigest();
  return NextResponse.json({ ok: true });
}
