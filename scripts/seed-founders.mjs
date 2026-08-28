#!/usr/bin/env node
/**
 * Grants every position listed in db/founders.json.
 *
 *   npm run founders            # skip positions that already have an owner
 *   npm run founders -- --force # replace existing owners too
 *
 * Exists because typing a long one-line command into a web console is fragile
 * (bracketed-paste mangles quotes). The details live in a committed file
 * instead, so the command is short enough to type by hand and the grants are
 * version controlled and repeatable.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const configPath = join(here, '..', 'db', 'founders.json');
const force = process.argv.includes('--force');

if (!process.env.DATABASE_URL) {
  console.error('[founders] DATABASE_URL is not set.');
  process.exit(1);
}

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

/** Ranks the icons a page declares: apple-touch-icon beats a 16px favicon. */
function declaredIcons(html, base) {
  const found = [];
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1]?.toLowerCase() ?? '';
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    let score = 0;
    if (rel.includes('apple-touch-icon')) score = 300;
    else if (rel.includes('icon')) score = 200;
    else continue;
    const px = Number.parseInt(/\bsizes\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1] ?? '', 10);
    if (Number.isFinite(px)) score += Math.min(px, 512) / 8;
    if (/\.png/i.test(href)) score += 20;
    found.push({ score, url: new URL(href, base).toString() });
  }
  return found.sort((a, b) => b.score - a.score).map((f) => f.url);
}

async function resolveLogo(site, override) {
  if (override) {
    const bytes = await readFile(join(here, '..', override));
    const mime = identify(bytes);
    if (!mime) throw new Error(`${override} is not a supported image`);
    return { mime, bytes, from: override };
  }
  const base = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`);
  let declared = [];
  try {
    const html = (await download(base.toString())).toString('utf8');
    declared = declaredIcons(html.split(/<\/head>/i)[0] ?? html, base);
  } catch (err) {
    console.warn(`    could not read ${base.host}: ${err.message}`);
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
      if (mime && bytes.length <= 256 * 1024) return { mime, bytes, from: url };
    } catch {
      /* next candidate */
    }
  }
  throw new Error('no usable logo found (add "logo": "public/your-logo.png")');
}

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

async function grant(entry) {
  const { rows } = await client.query(
    'SELECT slug, label, starting_bid_cents, owner_user_id FROM positions WHERE slug = $1',
    [entry.slug],
  );
  const position = rows[0];
  if (!position) throw new Error(`no position "${entry.slug}"`);
  if (position.owner_user_id && !force) {
    console.log(`  - ${position.label}: already owned, skipping (use --force to replace)`);
    return;
  }

  const logo = await resolveLogo(entry.site, entry.logo);
  const amount = Number.isInteger(entry.amountCents)
    ? entry.amountCents
    : position.starting_bid_cents;

  await client.query('BEGIN');
  const { rows: existing } = await client.query(
    'SELECT id FROM users WHERE lower(email) = lower($1)',
    [entry.email],
  );
  const userId =
    existing[0]?.id ??
    (await client.query('INSERT INTO users (handle, email) VALUES ($1,$2) RETURNING id', [
      entry.handle,
      entry.email,
    ])).rows[0].id;

  const website = /^https?:\/\//i.test(entry.site) ? entry.site : `https://${entry.site}`;
  const { rows: company } = await client.query(
    `INSERT INTO companies (user_id, name, tagline, website_url, x_username, logo_mime, logo_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [userId, entry.name, entry.tagline, website, entry.x || null, logo.mime, logo.bytes],
  );
  await client.query(
    'UPDATE ownership SET released_at = now() WHERE position_slug = $1 AND released_at IS NULL',
    [entry.slug],
  );
  await client.query(
    `UPDATE positions SET current_bid_cents = $2, owner_user_id = $3, owner_company_id = $4,
            ownership_changes = ownership_changes + 1, owned_since = now(), updated_at = now()
      WHERE slug = $1`,
    [entry.slug, amount, userId, company[0].id],
  );
  await client.query(
    'INSERT INTO ownership (position_slug, user_id, company_id, bid_cents) VALUES ($1,$2,$3,$4)',
    [entry.slug, userId, company[0].id, amount],
  );
  await client.query('COMMIT');

  console.log(
    `  + ${position.label}: @${entry.handle} - ${entry.name} at $${(amount / 100).toFixed(2)}` +
      `\n    logo ${logo.from}`,
  );
}

async function main() {
  const config = JSON.parse(await readFile(configPath, 'utf8'));
  await client.connect();
  console.log(`\n[founders] ${config.grants.length} grant(s) from db/founders.json\n`);
  let failures = 0;
  for (const entry of config.grants) {
    try {
      await grant(entry);
    } catch (err) {
      failures += 1;
      await client.query('ROLLBACK').catch(() => {});
      console.error(`  ! ${entry.slug}: ${err.message}`);
    }
  }
  console.log(failures === 0 ? '\n[founders] done\n' : `\n[founders] done, ${failures} failed\n`);
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    console.error('[founders]', err.message);
    await client.end().catch(() => {});
    process.exit(1);
  });
