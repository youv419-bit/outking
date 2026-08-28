#!/usr/bin/env node
/**
 * Wipes every trace of testing and returns the board to launch state.
 *
 *   node scripts/reset-board.mjs --confirm
 *   node scripts/reset-board.mjs --confirm --keep-visitors
 *
 * Deletes: owners, companies, bids, transactions, webhook events, ownership
 * history, outbound click counts and (unless --keep-visitors) visitor records.
 * Keeps: the 16 positions themselves, reset to unowned at their starting bids.
 *
 * TRUNCATE is deliberately NOT used: `positions` has foreign keys to `users`
 * and `companies`, so TRUNCATE ... CASCADE would take the 16 positions with it.
 * These deletes are explicit and ordered instead.
 *
 * This is irreversible. It refuses to run without --confirm, and warns loudly
 * if it finds payments that settled in live mode.
 */
import pg from 'pg';

const args = new Set(process.argv.slice(2));
if (!args.has('--confirm')) {
  console.error(`
  This deletes ALL owners, bids and payment records.

  Re-run with --confirm to proceed:
      node scripts/reset-board.mjs --confirm

  Optional: --keep-visitors   preserve the visitor counter
`);
  process.exit(1);
}

const keepVisitors = args.has('--keep-visitors');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[reset] DATABASE_URL is not set.');
  process.exit(1);
}

const client = new pg.Client({
  connectionString,
  ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});

async function count(table) {
  try {
    const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${table}`);
    return rows[0].n;
  } catch {
    return 0; // table not present yet
  }
}

async function main() {
  await client.connect();

  const before = {
    users: await count('users'),
    companies: await count('companies'),
    bids: await count('bids'),
    transactions: await count('transactions'),
    payment_events: await count('payment_events'),
    ownership: await count('ownership'),
    link_clicks: await count('link_clicks'),
    visitors: await count('visitors'),
  };

  const { rows: paid } = await client.query(
    `SELECT count(*)::int AS n, COALESCE(sum(amount_cents), 0)::int AS total
       FROM transactions WHERE status = 'succeeded'`,
  );
  if (paid[0].n > 0) {
    console.warn(
      `\n  ⚠  ${paid[0].n} settled payment(s) totalling ${(paid[0].total / 100).toFixed(2)} ` +
        `will be erased from this database.\n     (Dodo keeps its own record; this only clears ChessBid.)\n`,
    );
  }

  await client.query('BEGIN');

  // 1. Release the positions first - this is what clears the FK references.
  await client.query(`
    UPDATE positions
       SET current_bid_cents = NULL,
           owner_user_id     = NULL,
           owner_company_id  = NULL,
           ownership_changes = 0,
           owned_since       = NULL,
           updated_at        = now()
  `);

  // 2. Then the dependent data, children before parents.
  const tables = [
    'link_clicks',
    'ownership',
    'transactions',
    'bids',
    'payment_events',
    'companies',
    'users',
    ...(keepVisitors ? [] : ['visitors']),
  ];
  for (const table of tables) {
    try {
      await client.query(`DELETE FROM ${table}`);
    } catch (err) {
      if (err.code === '42P01') continue; // table does not exist yet
      throw err;
    }
  }

  await client.query('COMMIT');

  const positions = await count('positions');
  console.log('\n[reset] cleared:');
  for (const [table, n] of Object.entries(before)) {
    if (table === 'visitors' && keepVisitors) {
      console.log(`  ${table.padEnd(15)} ${n} (kept)`);
    } else {
      console.log(`  ${table.padEnd(15)} ${n} → 0`);
    }
  }
  console.log(`\n[reset] ${positions} positions are unowned and back at their starting bids.`);
  console.log('[reset] run `npm run seed` if you also changed prices in src/lib/board.json.\n');
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[reset]', err);
    await client.end().catch(() => {});
    process.exit(1);
  });
