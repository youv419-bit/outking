import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { currentUser } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Polled by the return page while the webhook lands. Never used to grant
 * ownership - it only reports what the webhook already wrote.
 */
export async function GET(request: Request) {
  const bidId = new URL(request.url).searchParams.get('bid');
  if (!bidId) {
    return NextResponse.json({ error: 'Missing bid' }, { status: 400 });
  }
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'No session' }, { status: 401 });
  }
  const row = await queryOne<{
    status: string;
    position_slug: string;
    amount_cents: number;
  }>(
    `SELECT status, position_slug, amount_cents
       FROM bids WHERE id = $1 AND user_id = $2`,
    [bidId, user.id],
  );
  if (!row) {
    return NextResponse.json({ error: 'Unknown bid' }, { status: 404 });
  }
  return NextResponse.json(
    { status: row.status, slug: row.position_slug, amountCents: row.amount_cents },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
