#!/usr/bin/env node
/**
 * Seeds the fixed supply of 16 positions from src/lib/board.json.
 * Idempotent: ownership and bid history are never touched.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const boardPath = join(__dirname, '..', 'src', 'lib', 'board.json');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[seed] DATABASE_URL is not set.');
  process.exit(1);
}

const ssl =
  process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

const client = new pg.Client({ connectionString, ssl });

async function main() {
  const board = JSON.parse(await readFile(boardPath, 'utf8'));
  await client.connect();
  await client.query('BEGIN');
  for (const p of board.positions) {
    await client.query(
      `INSERT INTO positions (slug, piece_type, label, square, sort_order, starting_bid_cents)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (slug) DO UPDATE SET
         piece_type = EXCLUDED.piece_type,
         label = EXCLUDED.label,
         square = EXCLUDED.square,
         sort_order = EXCLUDED.sort_order,
         starting_bid_cents = EXCLUDED.starting_bid_cents`,
      [p.slug, p.pieceType, p.label, p.square, p.sortOrder, p.startingBidCents],
    );
  }
  await client.query('COMMIT');
  console.log(`[seed] ${board.positions.length} positions ready`);
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[seed]', err);
    await client.end().catch(() => {});
    process.exit(1);
  });
