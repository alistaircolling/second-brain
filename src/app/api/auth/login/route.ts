import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const cookieName = 'sb_auth';

const hashValue = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

export async function POST(req: NextRequest) {
  const body = await req.json();
  const password = typeof body?.password === 'string' ? body.password.trim() : '';

  const envPass = process.env.AUTH_PASSWORD || '';

  if (!envPass) {
    return NextResponse.json({ error: 'Auth not configured.' }, { status: 500 });
  }

  if (password !== envPass) {
    return NextResponse.json({ error: 'Invalid credentials.' }, { status: 401 });
  }

  const token = hashValue(envPass);
  const response = NextResponse.json({ ok: true });

  response.cookies.set(cookieName, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });

  return response;
}
