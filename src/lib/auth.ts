import { NextRequest } from 'next/server';
import crypto from 'crypto';

const cookieName = 'sb_auth';

const hashValue = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

const getExpectedToken = () => {
  const password = process.env.AUTH_PASSWORD;

  if (!password) return null;

  return hashValue(password);
};

export const isRequestAuthorized = (req: NextRequest): boolean => {
  const expected = getExpectedToken();
  if (!expected) return true;

  const cookie = req.cookies.get(cookieName)?.value;
  if (!cookie) return false;

  return cookie === expected;
};
