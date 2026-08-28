# Going live

Three things to do, in this order: **clear the test data**, **switch Dodo to
live**, **verify**. Budget twenty minutes.

---

## 1. Clear the test data

One command. It empties every table that testing touched and returns the 16
positions to unowned at their starting bids.

```bash
railway run npm run board:reset -- --confirm
```

Locally, or with `DATABASE_URL` exported:

```bash
npm run board:reset -- --confirm
```

**What it deletes:** owners (`users`), brand submissions (`companies`), every
bid, transaction and webhook event, ownership history, and outbound click
counts.

**What it keeps:** the 16 positions themselves, reset to unowned. Prices come
from `src/lib/board.json` and are re-applied by the seed on every deploy.

Options:

| Flag               | Effect                                                     |
| ------------------ | ---------------------------------------------------------- |
| `--confirm`        | Required. Without it the script refuses and explains.      |
| `--keep-visitors`  | Preserve the visitor counter so it doesn't restart at zero |

It warns before deleting if it finds settled payments — the money is real and
Dodo keeps its own record, but ChessBid's copy is gone for good.

To release a single position instead of the whole board:

```bash
railway run npm run position:reset -- king
```

### If you prefer raw SQL

```sql
BEGIN;
UPDATE positions SET current_bid_cents = NULL, owner_user_id = NULL,
       owner_company_id = NULL, ownership_changes = 0, owned_since = NULL;
DELETE FROM link_clicks;
DELETE FROM ownership;
DELETE FROM transactions;
DELETE FROM bids;
DELETE FROM payment_events;
DELETE FROM companies;
DELETE FROM users;
DELETE FROM visitors;
COMMIT;
```

Do **not** use `TRUNCATE ... CASCADE` here. `positions` has foreign keys to
`users` and `companies`, so CASCADE would delete your 16 positions too.

---

## 2. Switch Dodo Payments to live

Test mode and live mode are separate worlds in Dodo. Nothing carries over —
not the product, not the keys, not the webhook, not its signing secret. **All
four values must be re-created in live mode.**

### In the Dodo dashboard (live mode)

1. **Complete business verification and payout details.** Live checkouts will
   not process until Dodo has approved the account. Do this first — approval
   can take time.

2. **Create the product again.** Products → new **one-time** product, name it
   whatever you like (e.g. "ChessBid position"), and **enable pay what you
   want**. Without that flag Dodo ignores the per-bid amount and charges the
   product's fixed price for every position. Copy the new `pdt_…` id.

3. **Create a live API key.** Developer → API keys.

4. **Create the live webhook.** Developer → Webhooks → add endpoint:

   ```
   https://<your-live-domain>/api/webhooks/dodo
   ```

   Subscribe to the events in section 3 below, then copy **this endpoint's**
   signing secret. A test-mode secret against a live endpoint produces 401s
   that look exactly like a code bug.

### In Railway → Variables

| Variable                    | New value                                  |
| --------------------------- | ------------------------------------------ |
| `DODO_PAYMENTS_ENVIRONMENT` | `live_mode`                                |
| `DODO_PAYMENTS_API_KEY`     | the **live** API key                       |
| `DODO_PRODUCT_ID`           | the **live** pay-what-you-want product id  |
| `DODO_PAYMENTS_WEBHOOK_KEY` | the **live** endpoint's signing secret     |
| `NEXT_PUBLIC_SITE_URL`      | your final domain, no trailing slash       |

`NEXT_PUBLIC_SITE_URL` is easy to forget and matters: it builds the URL payers
return to after checkout, and every canonical and Open Graph tag on the site.
It must match the domain in the webhook.

Also worth setting before launch:

| Variable             | Default | Why you might change it                      |
| -------------------- | ------- | -------------------------------------------- |
| `BID_MULTIPLIER`     | `1.10`  | How steeply prices climb per steal           |
| `BID_ROUNDING_CENTS` | `100`   | Minimum raise, in cents                      |
| `BID_CURRENCY`       | `USD`   | Must match what your Dodo account settles in |
| `SESSION_SECRET`     | —       | Generate a fresh one for launch              |

Regenerate `SESSION_SECRET` now if the current value has ever been pasted
anywhere: `openssl rand -hex 32`. It signs the cookie that proves who owns
what. Changing it signs everyone out — harmless before launch, rude after.

Starting prices live in `src/lib/board.json`. Set them before launch: the seed
only updates the *starting* bid, so once a position is owned its price is
driven by bidding, not by that file.

---

## 3. Webhook events

**Required — the site does not work without it:**

- `payment.succeeded` — the only event that transfers ownership.

**Recommended:**

- `payment.failed` — marks the bid dead so abandoned attempts don't linger as
  `pending`.

That is the whole list. The handler also accepts `payment.cancelled` if your
dashboard offers it, treating it the same as failed.

Subscribing to more is harmless — refunds, disputes, subscriptions and payouts
all get their signature verified, get logged into `payment_events`, and no
action is taken. But nothing else is wired to behaviour, so don't expect a
refund event to release a position; that is manual.

**Same two events in live as in test.** Nothing changes except the endpoint URL
and the signing secret.

---

## 4. Verify before announcing

```bash
curl https://<your-domain>/api/health
# {"ok":true,"positions":16}
```

A `missingEnv` field in that response lists any payment variable still unset.

Then, in order:

- [ ] The board loads and reads **16 POSITIONS · 0 CLAIMED · 16 AVAILABLE**
- [ ] `/king` loads directly and its share card renders
- [ ] `/robots.txt` and `/sitemap.xml` show the live domain
- [ ] **Buy a pawn with a real card.** $5 is a cheap test of the real path.
- [ ] The board updates within a few seconds and shows "YOU OWN THE …"
- [ ] Dodo → Webhooks → Logs shows a `200` for that delivery
- [ ] Open the position in a private window with a different email — the
      **OUTBID** button appears at the raised price
- [ ] `railway run npm run position:reset -- pawn-a` to release your test buy

If the webhook log shows `401`, the signing secret is wrong or from test mode.
If it shows `500`, the handler threw — check Railway's deploy logs; Dodo will
retry on its own.

---

## Known limits worth knowing on day one

- **Refunds are manual.** If two people pay for the same position within the
  same instant, the loser's bid is marked `refund_required` and no ownership
  moves. Refund it in the Dodo dashboard. Find them with:

  ```sql
  SELECT id, position_slug, amount_cents, created_at
    FROM bids WHERE status = 'refund_required';
  ```

- **One instance.** The rate limiter is per-process, so scaling to multiple
  replicas weakens it. The payment path itself is safe under concurrency — it
  relies on Postgres row locks and unique indexes, not process memory.

- **Turn on Postgres backups** in Railway before you take real money.
