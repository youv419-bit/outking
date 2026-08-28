import { NextResponse } from 'next/server';
import { getBoardState } from '@/lib/positions';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const user = await currentUser();
  const state = await getBoardState(user?.id ?? null);
  return NextResponse.json(state, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
