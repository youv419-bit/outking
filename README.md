# ChessBid

**Own the piece. Defend it. Outbid anyone who wants it.**

A 3D chessboard with sixteen ownable positions. Claim one, put your brand on it,
and hold it until someone pays more. That is the entire product.

```
SEE THE BOARD → WANT A PIECE → BID → PAY → OWN IT → GET OUTBID → TAKE IT BACK
```

---

## What it does

- **16 positions, one owner each.** King, Queen, 2 Rooks, 2 Bishops, 2 Knights, 8 Pawns.
- **A real 3D board.** Rotate, zoom, pan, tap a piece. Pieces are generated
  procedurally, so the board costs zero asset downloads.
- **Your brand on the piece.** Logo, name, tagline and a clickable link, shown
  in the arena and on the position's own page.
- **Outbid mechanics.** Every position has a *steal for* price computed on the
  server. Pay it and the piece changes hands, live.
- **Payments via Dodo Payments.** Ownership moves only after a signature-verified
  webhook confirms the money landed.
- **Shareable everywhere.** Every position has a clean URL, its own metadata and
  its own generated Open Graph card, plus a one-click share to X.
- **The form fills itself in.** Paste your website and ChessBid reads its
  name, description and logo straight off the page.
- **Owners see their return.** Each position shows how many clicks ChessBid has
  sent to that site, and the board shows live visitor numbers.

## Tech stack

| Layer     | Choice                                            |
| --------- | ------------------------------------------------- |
| Framework | Next.js (App Router) + React + TypeScript         |
| 3D        | three.js, React Three Fiber, drei                 |
| Styling   | Tailwind CSS                                      |
| Database  | PostgreSQL via `pg` (no ORM, plain SQL migrations) |
| Payments  | Dodo Payments (checkout sessions + webhooks)      |
| Hosting   | Railway                                           |

No auth provider, no admin panel, no dashboard, no leaderboards. On purpose.

## Local installation

```bash
npm install
cp .env.example .env.local     # then fill it in
npm run db:setup               # migrations + seed the 16 positions
npm run dev                    # http://localhost:3000
```

Requires Node 20.11+ and a PostgreSQL 14+ database.

## Environment variables

| Variable                    | Required | What it is                                              |
| --------------------------- | -------- | ------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`      | yes      | Public base URL, no trailing slash                      |
| `DATABASE_URL`              | yes      | PostgreSQL connection string                            |
| `DATABASE_SSL`              | no       | `true` when the host needs TLS with a self-signed cert  |
| `SESSION_SECRET`            | yes      | 32+ random bytes (`openssl rand -hex 32`)               |
| `DODO_PAYMENTS_API_KEY`     | yes      | Dodo API key                                            |
| `DODO_PAYMENTS_WEBHOOK_KEY` | yes      | Dodo webhook signing secret                             |
| `DODO_PAYMENTS_ENVIRONMENT` | no       | `test_mode` (default) or `live_mode`                    |
| `DODO_PRODUCT_ID`           | yes      | A pay-what-you-want product used for every bid          |
| `BID_MULTIPLIER`            | no       | Default `1.10`                                          |
| `BID_ROUNDING_CENTS`        | no       | Default `500` (round up to the nearest $5)              |
| `BID_CURRENCY`              | no       | Default `USD`                                           |

See `.env.example`. Never commit real values.

## Database setup

```bash
npm run migrate   # applies db/migrations/*.sql once each, transactionally
npm run seed      # inserts/updates the 16 positions from src/lib/board.json
```

Seven tables: `users`, `companies`, `positions`, `ownership`, `bids`,
`transactions`, `payment_events`. The schema lives in
`db/migrations/001_init.sql`.

To change the piece line-up or starting prices, edit `src/lib/board.json` and
re-run `npm run seed`. Live ownership is never touched.

## Dodo Payments setup

Full detail in [DODO_PAYMENTS.md](./DODO_PAYMENTS.md). The short version:

1. Create one **pay what you want** product in Dodo and put its id in `DODO_PRODUCT_ID`.
2. Point a webhook at `https://your-domain/api/webhooks/dodo` and copy the signing
   secret into `DODO_PAYMENTS_WEBHOOK_KEY`.
3. That is it — ChessBid sends the server-computed amount per checkout.

## Railway deployment

Full detail in [RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md).

- Build: leave it to Railway's builder — no custom build command (never `npm ci`)
- Start: `npm run railway:start` (runs migrations, seeds, then starts)

## Production build

```bash
npm run verify   # typecheck + lint + tests + production build
npm run build
npm start
```

## How bidding works

1. A position's price is **always computed on the server**:
   `next = max(ceil(current × BID_MULTIPLIER) rounded up to BID_ROUNDING_CENTS, current + BID_ROUNDING_CENTS)`.
   An unowned position costs its starting bid. The browser never sends an amount.
2. Submitting the claim form creates a **pending** `bids` row and a Dodo checkout
   session carrying `metadata.bid_id`. Nothing has changed on the board yet.
3. Dodo posts `payment.succeeded` to `/api/webhooks/dodo`. The signature is
   verified, the delivery is recorded (its id is a primary key), and settlement
   runs in one transaction that locks the bid **and** the position.
4. Under that lock the paid amount is re-checked against the current required
   price. If someone else won the piece in the meantime, the bid is marked
   `refund_required` and ownership does not move.
5. Otherwise: previous ownership row is closed, the position gets a new owner,
   company and price, a new `ownership` row is written, and every other pending
   bid at or below the new price is marked `superseded`.

Three independent guards make webhook replays harmless: the `payment_events`
primary key, the unique index on `transactions(provider, provider_payment_id)`,
and the pending-status check inside the lock.

## Project layout

```
db/migrations/     SQL migrations
scripts/           migrate, seed, brand asset generators
src/app/           routes, API handlers, metadata (sitemap, robots, manifest, OG)
src/components/    3D scene, pieces, panels, forms
src/lib/           config, db, money, positions, ownership, dodo, session
tests/             dependency-free unit tests
```

## Licence

Proprietary. All rights reserved.
