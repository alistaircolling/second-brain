import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/api/auth/login',
  '/api/slack',
  '/api/cron',
  '/_next',
  '/favicon.ico',
  '/manifest.json',
  '/icon.svg',
];

const cookieName = 'sb_auth';

const isPublicPath = (pathname: string) =>
  PUBLIC_PATHS.some((path) => pathname.startsWith(path));

const hashValue = async (value: string): Promise<string> => {
  const data = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

export async function middleware(req: NextRequest) {
  if (isPublicPath(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const password = process.env.AUTH_PASSWORD;

  if (!password) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(cookieName)?.value;
  if (!cookie) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  const expected = await hashValue(password);

  if (cookie !== expected) {
    const response = NextResponse.redirect(new URL('/login', req.url));
    response.cookies.delete(cookieName);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
