import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';
import { missingPaymentEnv } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Deployment healthcheck. Cheaper and far more diagnosable than pointing the
 * platform healthcheck at `/`, which renders the whole page: this reports
 * whether the process is up AND whether the board has actually been seeded,
 * and says which of the two failed.
 */
export async function GET() {
  try {
    const row = await queryOne<{ count: string }>('SELECT count(*)::text AS count FROM positions');
    const positions = Number(row?.count ?? 0);
    if (positions === 0) {
      return NextResponse.json(
        { ok: false, reason: 'no positions seeded - run `npm run seed`' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    // Missing payment config is reported but does not fail the healthcheck:
    // the board still renders, it just cannot take bids yet.
    const missingEnv = missingPaymentEnv();
    return NextResponse.json(
      { ok: true, positions, ...(missingEnv.length ? { missingEnv } : {}) },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    console.error('[health] database unreachable', error);
    return NextResponse.json(
      { ok: false, reason: 'database unreachable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
