import { NextResponse } from 'next/server';
import { sendMorningDigest } from '@/lib/digest';

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    console.error('Morning digest: Unauthorized - check CRON_SECRET env var');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await sendMorningDigest();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Morning digest failed:', error);
    return NextResponse.json({ error: 'Failed to send digest' }, { status: 500 });
  }
}
