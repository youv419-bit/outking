import { NextResponse } from 'next/server';
import { queryOne } from '@/lib/db';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID.test(id)) {
    return new NextResponse('Not found', { status: 404 });
  }
  const row = await queryOne<{ logo_mime: string | null; logo_data: Buffer | null }>(
    'SELECT logo_mime, logo_data FROM companies WHERE id = $1',
    [id],
  );
  if (!row?.logo_data || !row.logo_mime) {
    return new NextResponse('Not found', { status: 404 });
  }
  return new NextResponse(new Uint8Array(row.logo_data), {
    headers: {
      'Content-Type': row.logo_mime,
      'Content-Length': String(row.logo_data.length),
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
