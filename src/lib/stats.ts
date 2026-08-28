import 'server-only';
import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { query, queryOne } from './db';

/**
 * Visitor presence and outbound-click counting.
 *
 * Visitors are identified by an opaque cookie, not an IP address - enough to
 * count people rather than page loads, without storing anything identifying.
 * "Online" means seen in the last five minutes.
 */

const VISITOR_COOKIE = 'cb_visitor';
const ONLINE_WINDOW = "5 minutes";

export async function visitorId(create = false): Promise<string | null> {
  const store = await cookies();
  const existing = store.get(VISITOR_COOKIE)?.value;
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  if (!create) return null;
  const fresh = randomUUID();
  store.set(VISITOR_COOKIE, fresh, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  return fresh;
}

/**
 * `countView` is true for a page load and false for the keep-alive heartbeat,
 * so a tab left open all afternoon counts as one view, not two hundred.
 */
export async function recordVisit(id: string, countView = false): Promise<void> {
  await queryOne(
    `INSERT INTO visitors (visitor_id, views) VALUES ($1, 1)
     ON CONFLICT (visitor_id) DO UPDATE
        SET last_seen = now(),
            views = visitors.views + CASE WHEN $2 THEN 1 ELSE 0 END
     RETURNING visitor_id`,
    [id, countView],
  );
}

export type SiteStats = { online: number; visitors: number; views: number };

export async function getSiteStats(): Promise<SiteStats> {
  try {
    return await readSiteStats();
  } catch (error) {
    // A board that renders without stats beats a board that does not render.
    console.error('[stats] site stats unavailable', error);
    return { online: 1, visitors: 0, views: 0 };
  }
}

async function readSiteStats(): Promise<SiteStats> {
  const row = await queryOne<{ online: string; total: string; views: string }>(
    `SELECT count(*) FILTER (WHERE last_seen > now() - interval '${ONLINE_WINDOW}')::text AS online,
            count(*)::text AS total,
            COALESCE(sum(views), 0)::text AS views
       FROM visitors`,
  );
  return {
    online: Math.max(1, Number(row?.online ?? 0)),
    visitors: Number(row?.total ?? 0),
    views: Number(row?.views ?? 0),
  };
}

/**
 * Records an outbound click. The unique index on
 * (position, visitor, hour) makes repeat clicks within the hour a no-op, so a
 * refresh loop cannot inflate an owner's number.
 */
export async function recordClick(
  slug: string,
  companyId: string | null,
  visitor: string | null,
): Promise<void> {
  await queryOne(
    `INSERT INTO link_clicks (position_slug, company_id, visitor_id)
     VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [slug, companyId, visitor],
  );
}

/** Click totals for the current owner of each position. */
export async function clicksByPosition(): Promise<Map<string, number>> {
  try {
    return await readClicks();
  } catch (error) {
    console.error('[stats] click counts unavailable', error);
    return new Map();
  }
}

async function readClicks(): Promise<Map<string, number>> {
  const rows = await query<{ position_slug: string; clicks: string }>(
    `SELECT c.position_slug, count(*)::text AS clicks
       FROM link_clicks c
       JOIN positions p ON p.slug = c.position_slug
      WHERE p.owner_company_id IS NOT NULL
        AND c.company_id = p.owner_company_id
      GROUP BY c.position_slug`,
  );
  return new Map(rows.map((row) => [row.position_slug, Number(row.clicks)]));
}
