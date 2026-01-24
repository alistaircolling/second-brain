import { NextRequest, NextResponse } from 'next/server';
import { isRequestAuthorized } from '@/lib/auth';
import { classifyMessage } from '@/lib/openai';

export async function POST(req: NextRequest) {
  if (!isRequestAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const body = await req.json();
  const text = typeof body?.text === 'string' ? body.text.trim() : '';

  if (!text) {
    return NextResponse.json({ error: 'Text is required.' }, { status: 400 });
  }

  const result = await classifyMessage(text);

  return NextResponse.json(result);
}
