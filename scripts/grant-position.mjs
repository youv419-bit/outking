#!/usr/bin/env node
/**
 * Grant a position to a brand without a payment.
 *
 * For founding owners: your own projects, or the first few people you invite to
 * seed the board. The position is recorded at its starting bid, so the next
 * person still pays the normal steal price to take it.
 *
 *   node scripts/grant-position.mjs \
 *     --slug queen \
 *     --handle syc \
 *     --email you@example.com \
 *     --site https://syc.lol \
 *     --name "syc.lol" \
 *     --tagline "Stake a claim on one of 100 lots." \
 *     [--x syclol] [--logo ./logo.png] [--amount 1200]
 *
 * The logo is read from the site automatically (apple-touch-icon, then icon
 * links, then the usual well-known paths). Pass --logo to use a local file.
 */
import { readFile } from 'node:fs/promises';
import pg from 'pg';

// ── args ────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};

const slug = arg('slug');
const handle = arg('handle');
const email = arg('email');
const site = arg('site');
const name = arg('name');
const tagline = arg('tagline');
const xUser = arg('x')?.replace(/^@/, '');
const logoPath = arg('logo');
const amountArg = arg('amount');

const missing = Object.entries({ slug, handle, email, site, name, tagline })
  .filter(([, v]) => !v)
  .map(([k]) => `--${k}`);

if (missing.length) {
  console.error(`
  Missing: ${missing.join(', ')}

  node scripts/grant-position.mjs --slug queen --handle syc \\
    --email you@example.com --site https://syc.lol \\
    --name "syc.lol" --tagline "Stake a claim on one of 100 lots."

  Optional: --x <handle>  --logo <file>  --amount <cents>
`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('[grant] DATABASE_URL is not set.');
  process.exit(1);
}

// ── logo ────────────────────────────────────────────────────
const SIGNATURES = [
  { mime: 'image/png', test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/gif', test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  { mime: 'image/x-icon', test: (b) => b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00 },
  {
    mime: 'image/webp',
    test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
];

const identify = (bytes) => SIGNATURES.find((s) => s.test(bytes))?.mime ?? null;

async function download(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'ChessBidBot/1.0', Accept: '*/*' },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function iconCandidates(html, base) {
  const found = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    let score = 0;
    if (rel.includes('apple-touch-icon')) score = 300;
    else if (rel.includes('icon')) score = 200;
    else continue;
    const sizes = /\bsizes\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    const px = Number.parseInt(sizes ?? '', 10);
    if (Number.isFinite(px)) score += Math.min(px, 512) / 8;
    if (/\.png/i.test(href)) score += 20;
    found.push({ score, url: new URL(href, base).toString() });
  }
  found.sort((a, b) => b.score - a.score);
  return found.map((f) => f.url);
}

async function resolveLogo() {
  if (logoPath) {
    const bytes = await readFile(logoPath);
    const mime = identify(bytes);
    if (!mime) throw new Error(`${logoPath} is not a PNG, JPEG, GIF, WebP or ICO`);
    console.log(`[grant] logo: ${logoPath} (${mime}, ${(bytes.length / 1024).toFixed(1)} KB)`);
    return { mime, bytes };
  }

  const base = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`);
  let declared = [];
  try {
    const html = (await download(base.toString())).toString('utf8');
    declared = iconCandidates(html.split(/<\/head>/i)[0] ?? html, base);
  } catch (err) {
    console.warn(`[grant] could not read ${base.host}: ${err.message}`);
  }

  const candidates = [
    ...declared,
    new URL('/apple-touch-icon.png', base).toString(),
    new URL('/favicon.ico', base).toString(),
    new URL('/favicon.png', base).toString(),
  ];

  for (const url of candidates.slice(0, 6)) {
    try {
      const bytes = await download(url);
      const mime = identify(bytes);
      if (mime && bytes.length <= 256 * 1024) {
        console.log(`[grant] logo: ${url} (${mime}, ${(bytes.length / 1024).toFixed(1)} KB)`);
        return { mime, bytes };
      }
    } catch {
      /* try the next candidate */
    }
  }
  throw new Error('No usable logo found. Pass one with --logo <file>.');
}

// ── run ─────────────────────────────────────────────────────
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

async function main() {
  const logo = await resolveLogo();
  await client.connect();

  const { rows: positions } = await client.query(
    'SELECT slug, label, starting_bid_cents, owner_user_id FROM positions WHERE slug = $1',
    [slug],
  );
  const position = positions[0];
  if (!position) throw new Error(`No position "${slug}". Try: king, queen, rook-a, pawn-a ...`);
  if (position.owner_user_id) {
    console.warn(`[grant] ${position.label} already has an owner - it will be replaced.`);
  }

  const amount = amountArg ? Number(amountArg) : position.starting_bid_cents;
  if (!Number.isInteger(amount) || amount <= 0) throw new Error('--amount must be whole cents');

  await client.query('BEGIN');

  const { rows: existing } = await client.query(
    'SELECT id FROM users WHERE lower(email) = lower($1)',
    [email],
  );
  const userId =
    existing[0]?.id ??
    (
      await client.query('INSERT INTO users (handle, email) VALUES ($1, $2) RETURNING id', [
        handle,
        email,
      ])
    ).rows[0].id;

  const website = /^https?:\/\//i.test(site) ? site : `https://${site}`;
  const { rows: company } = await client.query(
    `INSERT INTO companies (user_id, name, tagline, website_url, x_username, logo_mime, logo_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [userId, name, tagline, website, xUser ?? null, logo.mime, logo.bytes],
  );

  await client.query(
    `UPDATE ownership SET released_at = now() WHERE position_slug = $1 AND released_at IS NULL`,
    [slug],
  );
  await client.query(
    `UPDATE positions
        SET current_bid_cents = $2, owner_user_id = $3, owner_company_id = $4,
            ownership_changes = ownership_changes + 1, owned_since = now(), updated_at = now()
      WHERE slug = $1`,
    [slug, amount, userId, company[0].id],
  );
  await client.query(
    `INSERT INTO ownership (position_slug, user_id, company_id, bid_cents) VALUES ($1,$2,$3,$4)`,
    [slug, userId, company[0].id, amount],
  );

  await client.query('COMMIT');

  console.log(
    `\n[grant] @${handle} now owns the ${position.label} at $${(amount / 100).toFixed(2)}.` +
      `\n[grant] ${name} - ${website}\n`,
  );
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[grant]', err.message);
    await client.end().catch(() => {});
    process.exit(1);
  });
