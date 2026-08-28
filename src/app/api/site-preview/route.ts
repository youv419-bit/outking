import { NextResponse } from 'next/server';
import { fetchSitePreview } from '@/lib/sitePreview';
import { clientKey, rateLimit } from '@/lib/ratelimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Reads a company's own site to pre-fill the claim form. Rate limited because
 * it makes an outbound request on behalf of whoever calls it.
 */
export async function GET(request: Request) {
  if (!rateLimit(clientKey(request, 'preview'), 12, 60_000)) {
    return NextResponse.json({ error: 'Slow down a moment.' }, { status: 429 });
  }
  const url = new URL(request.url).searchParams.get('url');
  if (!url || url.length > 200) {
    return NextResponse.json({ error: 'Missing url' }, { status: 400 });
  }
  const preview = await fetchSitePreview(url);
  if (!preview) {
    return NextResponse.json({ error: 'Could not read that site' }, { status: 422 });
  }
  return NextResponse.json(preview, { headers: { 'Cache-Control': 'no-store' } });
}
