#!/usr/bin/env node
/**
 * Tiny forward-only migration runner.
 * Applies every db/migrations/*.sql exactly once, inside a transaction,
 * tracked in the _migrations table. Safe to run on every deploy.
 */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'db', 'migrations');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('[migrate] DATABASE_URL is not set.');
  process.exit(1);
}

const ssl =
  process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;

const client = new pg.Client({ connectionString, ssl });

async function main() {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  const { rows } = await client.query('SELECT name FROM _migrations');
  const applied = new Set(rows.map((r) => r.name));

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(migrationsDir, file), 'utf8');
    process.stdout.write(`[migrate] applying ${file} ... `);
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log('ok');
      count += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      console.log('FAILED');
      throw err;
    }
  }
  console.log(`[migrate] done (${count} applied, ${files.length - count} already present)`);
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    console.error('[migrate]', err);
    await client.end().catch(() => {});
    process.exit(1);
  });
