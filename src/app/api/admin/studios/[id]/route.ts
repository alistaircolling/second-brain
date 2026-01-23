import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminAuth, unauthorizedResponse } from '@/lib/auth';
import { getStudioById, updateStudio, deleteStudio } from '@/lib/notion';
import { UpdateStudioInput } from '@/types';

type Params = { params: Promise<{ id: string }> };

// GET /api/admin/studios/[id] - Get a specific studio
export const GET = async (req: NextRequest, { params }: Params) => {
  if (!verifyAdminAuth(req)) {
    return unauthorizedResponse();
  }

  const { id } = await params;

  try {
    const studio = await getStudioById(id);

    if (!studio) {
      return NextResponse.json({ error: 'Studio not found' }, { status: 404 });
    }

    return NextResponse.json({ studio });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch studio' }, { status: 500 });
  }
};

// PUT /api/admin/studios/[id] - Update a studio
export const PUT = async (req: NextRequest, { params }: Params) => {
  if (!verifyAdminAuth(req)) {
    return unauthorizedResponse();
  }

  const { id } = await params;

  try {
    const body = await req.json() as UpdateStudioInput;
    const studio = await updateStudio(id, body);

    if (!studio) {
      return NextResponse.json({ error: 'Studio not found' }, { status: 404 });
    }

    return NextResponse.json({ studio });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update studio' }, { status: 500 });
  }
};

// DELETE /api/admin/studios/[id] - Delete (archive) a studio
export const DELETE = async (req: NextRequest, { params }: Params) => {
  if (!verifyAdminAuth(req)) {
    return unauthorizedResponse();
  }

  const { id } = await params;

  try {
    const success = await deleteStudio(id);

    if (!success) {
      return NextResponse.json({ error: 'Studio not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to delete studio' }, { status: 500 });
  }
};
