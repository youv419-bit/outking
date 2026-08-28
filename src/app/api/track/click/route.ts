import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { BOARD_BY_SLUG } from '@/lib/positions';
import { recordClick, visitorId } from '@/lib/stats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Records an outbound click on an owner's website link. Called with
 * navigator.sendBeacon, so the browser navigates immediately and this never
 * delays the visitor.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { slug?: string };
    const slug = body.slug;
    if (!slug || !BOARD_BY_SLUG.has(slug)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }
    const position = await queryOne<{ owner_company_id: string | null }>(
      'SELECT owner_company_id FROM positions WHERE slug = $1',
      [slug],
    );
    if (!position?.owner_company_id) {
      return NextResponse.json({ ok: false }, { status: 404 });
    }
    await recordClick(slug, position.owner_company_id, await visitorId(false));
  } catch (error) {
    console.error('[track] click failed', error);
  }
  return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}
