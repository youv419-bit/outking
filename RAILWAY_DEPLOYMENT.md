# Deploying ChessBid on Railway

Two services: the Next.js app and a PostgreSQL database. About ten minutes.

## 1. Create the project

1. Push this repository to GitHub (or use `railway up` from the project root).
2. Railway → **New Project** → **Deploy from GitHub repo** → pick the repo.

## 2. Add PostgreSQL

**New** → **Database** → **Add PostgreSQL**.

Then in the app service → **Variables** → **Add reference variable** and select
the Postgres service's `DATABASE_URL`. Use the *private* URL — traffic stays on
Railway's internal network and no TLS workaround is needed, so leave
`DATABASE_SSL` unset (or `false`).

If you connect over the **public** proxy instead, set `DATABASE_SSL=true`.

## 3. Environment variables

> **The service will not start without these.** `npm run railway:start` runs the
> migration first; with no `DATABASE_URL` it exits immediately and the deploy
> fails at **Network → Healthcheck** with the build itself perfectly green. If
> the Variables tab reads `0 Variables`, that is the failure you are looking at.


In the app service → **Variables**:

| Variable                    | Value                                                  |
| --------------------------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_SITE_URL`      | `https://your-app.up.railway.app` (no trailing slash)  |
| `DATABASE_URL`              | reference to the Postgres service                      |
| `SESSION_SECRET`            | `openssl rand -hex 32`                                 |
| `DODO_PAYMENTS_API_KEY`     | from the Dodo dashboard                                |
| `DODO_PAYMENTS_WEBHOOK_KEY` | from the Dodo webhook you create in step 6             |
| `DODO_PAYMENTS_ENVIRONMENT` | `live_mode` in production                              |
| `DODO_PRODUCT_ID`           | the pay-what-you-want product id                       |
| `BID_MULTIPLIER`            | optional, default `1.10`                               |
| `BID_ROUNDING_CENTS`        | optional, default `500`                                |
| `BID_CURRENCY`              | optional, default `USD`                                |

`NODE_ENV=production` and `PORT` are set by Railway. Do not override `PORT` —
the start script reads it.

## 4. Build and start commands

Leave the builder on Railway's default (**Railpack**). It detects Next.js,
installs dependencies and runs `npm run build` on its own — you do not need a
custom build command at all.

`railway.json` sets only the start command:

- **Start command:** `npm run railway:start`
- **Healthcheck path:** `/api/health`

> **Do not put `npm ci` (or `npm install`) in the Custom Build Command.** The
> builder already runs the install phase and mounts a build cache inside
> `/app/node_modules/.cache`. `npm ci` begins by deleting `node_modules`, hits
> that mounted directory, and the build dies with:
>
> ```
> npm error code EBUSY
> npm error syscall rmdir
> npm error path /app/node_modules/.cache
> ```
>
> If you see that error, clear **Settings → Build → Custom Build Command** and
> redeploy. Note that values typed into the dashboard **override
> `railway.json`**, and changing a setting does not itself re-run the last
> deployment — trigger a fresh one.

## 5. Database migration

`npm run railway:start` runs, in order:

```
node scripts/migrate.mjs   # applies db/migrations/*.sql exactly once each
node scripts/seed.mjs      # upserts the 16 positions
next start -p $PORT
```

Both steps are idempotent and safe on every deploy. To run them by hand:

```bash
railway run npm run db:setup
```

## 6. Dodo webhook URL

Once the domain is live, register in the Dodo dashboard:

```
https://your-app.up.railway.app/api/webhooks/dodo
```

Subscribe to `payment.succeeded` and `payment.failed`, then copy that
endpoint's signing secret into `DODO_PAYMENTS_WEBHOOK_KEY` and redeploy.

Details in [DODO_PAYMENTS.md](./DODO_PAYMENTS.md).

## 7. Custom domain

**Settings → Networking → Custom Domain**, add the CNAME your registrar needs,
then update **both**:

- `NEXT_PUBLIC_SITE_URL` (canonical URLs, OG tags, sitemap, payment return URLs)
- the Dodo webhook endpoint

## 8. Production configuration notes

- **Single instance.** The in-process rate limiter and connection pool assume
  one replica. Before scaling horizontally, move rate limiting to Redis; the
  payment path is already safe under concurrency because it relies on Postgres
  row locks and unique indexes, not process state.
- **Pool size.** `DATABASE_POOL_MAX` defaults to 8. Keep replicas × pool size
  below your Postgres `max_connections`.
- **Logos** live in Postgres as `bytea`, capped at 256 KB each — 16 positions
  and their history stay comfortably small, and there is no object store to
  configure or leak.
- **Backups.** Railway's Postgres service supports scheduled backups; turn them
  on before taking real money.
- **Logs.** Failed settlements log with the bid id; search for
  `refund_required` to find bids that need a manual refund.

## Post-deploy checklist

- [ ] `/api/health` returns `{"ok":true,"positions":16}`
- [ ] `/` renders the board and the supply counter reads `16 POSITIONS`
- [ ] `/king` loads directly and its OG card renders (`/king/opengraph-image`)
- [ ] `/robots.txt` and `/sitemap.xml` return the live domain
- [ ] A test payment moves a pawn to a new owner
- [ ] `payment_events` shows `processed_at` set for that delivery
- [ ] Re-sending the same webhook from Dodo changes nothing
