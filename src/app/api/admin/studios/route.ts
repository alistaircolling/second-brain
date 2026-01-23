import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth, unauthorizedResponse } from '@/lib/auth';
import { createStudio, getStudios } from '@/lib/notion';
import { CreateStudioInput } from '@/types';

// GET /api/admin/studios - List all studios
export const GET = async (req: NextRequest) => {
  if (!verifyAdminAuth(req)) {
    return unauthorizedResponse();
  }

  try {
    const studios = await getStudios();
    return NextResponse.json({ studios });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch studios' }, { status: 500 });
  }
};

// POST /api/admin/studios - Create a new studio
export const POST = async (req: NextRequest) => {
  if (!verifyAdminAuth(req)) {
    return unauthorizedResponse();
  }

  try {
    const body = await req.json() as CreateStudioInput;

    if (!body.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const studio = await createStudio(body);
    return NextResponse.json({ studio }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create studio' }, { status: 500 });
  }
};
