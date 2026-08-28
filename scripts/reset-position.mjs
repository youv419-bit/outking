#!/usr/bin/env node
/**
 * Testing helper: release a position back to "available".
 *
 *   node scripts/reset-position.mjs king
 *   node scripts/reset-position.mjs --all
 *
 * Clears the owner, the current bid and the ownership history for that
 * position, leaving bids/transactions/payment_events intact as an audit trail.
 * Never run this against a board with real owners on it.
 */
import pg from 'pg';

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: node scripts/reset-position.mjs <slug|--all>');
  process.exit(1);
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[reset] DATABASE_URL is not set.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

const all = arg === '--all';

async function main() {
  await client.connect();
  await client.query('BEGIN');

  const where = all ? '' : 'WHERE position_slug = $1';
  const params = all ? [] : [arg];
  await client.query(`DELETE FROM ownership ${where}`, params);

  const result = await client.query(
    `UPDATE positions
        SET current_bid_cents = NULL,
            owner_user_id = NULL,
            owner_company_id = NULL,
            ownership_changes = 0,
            owned_since = NULL,
            updated_at = now()
      ${all ? '' : 'WHERE slug = $1'}
      RETURNING slug`,
    params,
  );

  await client.query('COMMIT');
  console.log(
    result.rowCount === 0
      ? `[reset] no position matched "${arg}"`
      : `[reset] released: ${result.rows.map((r) => r.slug).join(', ')}`,
  );
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[reset]', err);
    await client.end().catch(() => {});
    process.exit(1);
  });
