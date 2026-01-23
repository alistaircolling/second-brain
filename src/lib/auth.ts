import { NextRequest, NextResponse } from 'next/server';

export const verifyAdminAuth = (req: NextRequest): boolean => {
  const authHeader = req.headers.get('authorization');
  const apiKey = process.env.ADMIN_API_KEY;

  if (!apiKey) {
    return false;
  }

  return authHeader === `Bearer ${apiKey}`;
};

export const unauthorizedResponse = () =>
  NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
