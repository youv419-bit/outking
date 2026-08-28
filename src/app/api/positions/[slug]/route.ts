import { NextResponse } from 'next/server';
import { getHistory, getPosition } from '@/lib/positions';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const position = await getPosition(slug);
  if (!position) {
    return NextResponse.json({ error: 'Unknown position' }, { status: 404 });
  }
  const history = await getHistory(slug);
  return NextResponse.json({ position, history }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
