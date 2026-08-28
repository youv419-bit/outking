import { NextResponse } from 'next/server';
import { recordVisit, visitorId } from '@/lib/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Called on page load and on a slow heartbeat, so "online now" means something.
 * The body distinguishes the two: only a load counts as a view.
 */
export async function POST(request: Request) {
  try {
    let countView = false;
    try {
      const body = (await request.json()) as { view?: boolean };
      countView = body.view === true;
    } catch {
      /* heartbeats send no body */
    }
    const id = await visitorId(true);
    if (id) await recordVisit(id, countView);
  } catch (error) {
    console.error('[track] visit failed', error);
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
