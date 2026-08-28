import { NextResponse } from 'next/server';
import { queryOne, transaction } from '@/lib/db';
import { createCheckout } from '@/lib/dodo';
import { readLogo } from '@/lib/logo';
import { fetchRemoteLogo } from '@/lib/sitePreview';
import { currency, missingPaymentEnv } from '@/lib/config';
import { nextBidCents } from '@/lib/money';
import { BOARD_BY_SLUG } from '@/lib/positions';
import { clientKey, rateLimit } from '@/lib/ratelimit';
import { setSessionCookie, upsertUser } from '@/lib/session';
import { claimSchema, clean } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Claim or outbid a position.
 *
 * Everything that matters is decided here on the server: the price comes from
 * the database, not the request body, and the response is only a checkout URL.
 * No ownership changes until the Dodo webhook confirms the payment.
 */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, 'claim'), 8, 60_000)) {
    return NextResponse.json(
      { error: 'Too many attempts. Wait a minute and try again.' },
      { status: 429 },
    );
  }

  // Fail loudly and accurately when the deployment is not configured yet -
  // this used to surface as "payment provider is unavailable".
  const missing = missingPaymentEnv();
  if (missing.length > 0) {
    console.error(`[claim] refusing: missing environment variables: ${missing.join(', ')}`);
    return NextResponse.json(
      { error: 'This board is not open for bids yet. The site owner needs to finish configuration.' },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart form data' }, { status: 400 });
  }

  const parsed = claimSchema.safeParse({
    slug: form.get('slug'),
    handle: form.get('handle'),
    email: form.get('email'),
    companyName: form.get('companyName'),
    tagline: form.get('tagline'),
    websiteUrl: form.get('websiteUrl'),
    xUsername: form.get('xUsername') ?? undefined,
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return NextResponse.json(
      { error: first?.message ?? 'Invalid submission', field: first?.path?.[0] },
      { status: 400 },
    );
  }
  const input = parsed.data;

  if (!BOARD_BY_SLUG.has(input.slug)) {
    return NextResponse.json({ error: 'Unknown position' }, { status: 404 });
  }

  // A logo can arrive as an upload, or as a URL the claim form pulled off the
  // company's own site. Either way it is validated by magic bytes here.
  const logoField = form.get('logo');
  const logoUrlField = form.get('logoUrl');
  let logo: { mime: string; bytes: Buffer } | null = null;

  if (logoField instanceof File && logoField.size > 0) {
    const uploaded = await readLogo(logoField);
    if (!uploaded.ok) {
      return NextResponse.json({ error: uploaded.error, field: 'logo' }, { status: 400 });
    }
    logo = { mime: uploaded.mime, bytes: uploaded.bytes };
  } else if (typeof logoUrlField === 'string' && logoUrlField.trim()) {
    logo = await fetchRemoteLogo(logoUrlField.trim());
  }

  if (!logo) {
    return NextResponse.json(
      { error: 'Add a logo image, or use a website we can read one from.', field: 'logo' },
      { status: 400 },
    );
  }

  const user = await upsertUser(clean(input.handle), clean(input.email));
  await setSessionCookie(user.id);

  // Owners are allowed to raise their own bid: it is a legitimate way to
  // defend a position by making it more expensive to take, and it keeps the
  // action button present for everyone.
  const position = await queryOne<{
    starting_bid_cents: number;
    current_bid_cents: number | null;
    owner_user_id: string | null;
  }>(
    'SELECT starting_bid_cents, current_bid_cents, owner_user_id FROM positions WHERE slug = $1',
    [input.slug],
  );
  if (!position) {
    return NextResponse.json({ error: 'Unknown position' }, { status: 404 });
  }
  const amountCents = nextBidCents(position.current_bid_cents, position.starting_bid_cents);

  const { companyId, bidId } = await transaction(async (client) => {
    const company = await client.query<{ id: string }>(
      `INSERT INTO companies (user_id, name, tagline, website_url, x_username, logo_mime, logo_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        user.id,
        clean(input.companyName),
        clean(input.tagline),
        input.websiteUrl,
        input.xUsername ?? null,
        logo.mime,
        logo.bytes,
      ],
    );
    const bid = await client.query<{ id: string }>(
      `INSERT INTO bids (position_slug, user_id, company_id, amount_cents, currency)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [input.slug, user.id, company.rows[0].id, amountCents, currency],
    );
    return { companyId: company.rows[0].id, bidId: bid.rows[0].id };
  });

  try {
    const checkout = await createCheckout({
      bidId,
      slug: input.slug,
      amountCents,
      email: user.email,
      handle: user.handle,
    });
    await queryOne(
      'UPDATE bids SET checkout_session_id = $2 WHERE id = $1 RETURNING id',
      [bidId, checkout.sessionId],
    );
    return NextResponse.json({
      bidId,
      companyId,
      amountCents,
      checkoutUrl: checkout.checkoutUrl,
    });
  } catch (error) {
    console.error('[claim] checkout creation failed', error);
    await queryOne(
      `UPDATE bids SET status = 'failed', settled_at = now() WHERE id = $1 RETURNING id`,
      [bidId],
    );
    return NextResponse.json(
      { error: 'Payment provider is unavailable right now. Please try again.' },
      { status: 502 },
    );
  }
}
