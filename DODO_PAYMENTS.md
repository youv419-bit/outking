# Dodo Payments integration

Everything ChessBid needs from Dodo is two API surfaces: **checkout sessions**
to take the money, and **webhooks** to tell us it arrived. There is no
subscription logic, no customer portal and no stored card.

## 1. Required Dodo configuration

### The product

ChessBid does not create a product per bid. Prices move constantly, so instead
it uses **one product with "pay what you want" enabled** and sends the
server-computed amount with each checkout session.

1. Dashboard → **Products** → create a one-time product, e.g. "ChessBid position".
2. Enable **pay what you want** on it. (Without this, Dodo ignores the `amount`
   field and every bid would charge the product's fixed price.)
3. Copy the product id (`pdt_...`) into `DODO_PRODUCT_ID`.

### The API key

Dashboard → **Developer → API keys**. Copy into `DODO_PAYMENTS_API_KEY`.
Use a test key with `DODO_PAYMENTS_ENVIRONMENT=test_mode` while developing.

### The webhook

Dashboard → **Developer → Webhooks** → add endpoint:

```
https://<your-domain>/api/webhooks/dodo
```

Subscribe to at least:

- `payment.succeeded`
- `payment.failed`

Copy the signing secret into `DODO_PAYMENTS_WEBHOOK_KEY`.

## 2. Environment variables

```bash
DODO_PAYMENTS_API_KEY=          # required
DODO_PAYMENTS_WEBHOOK_KEY=      # required
DODO_PAYMENTS_ENVIRONMENT=test_mode   # or live_mode
DODO_PRODUCT_ID=                # required, the pay-what-you-want product
```

Nothing is hardcoded; `src/lib/config.ts` reads all four and throws a clear
error if one is missing at the moment it is needed.

## 3. Checkout process

`POST /api/claim` (`src/app/api/claim/route.ts`):

1. Validates the form (zod) and the logo (magic bytes, 256 KB cap).
2. Finds or creates the user, stores the company row.
3. **Computes the amount from the database** — `nextBidCents(current, starting)`.
   The browser's idea of the price is never read.
4. Inserts a `bids` row with status `pending`.
5. Creates the Dodo checkout session and returns only its URL.

```ts
// src/lib/dodo.ts
await dodo().checkoutSessions.create({
  product_cart: [{ product_id: DODO_PRODUCT_ID, quantity: 1, amount: amountCents }],
  customer: { email, name: handle },
  return_url: `${siteUrl}/${slug}?paid=${bidId}`,
  cancel_url: `${siteUrl}/${slug}?cancelled=1`,
  billing_currency: 'USD',
  metadata: { bid_id: bidId, position_slug: slug, handle },
});
```

`metadata.bid_id` is the only thing the webhook needs to find its way home.

The browser is then sent to `checkout_url`. On return it polls
`/api/checkout/status?bid=…`, which **reports** the bid's status — it can never
grant ownership.

## 4. Webhook URL and verification

```
POST /api/webhooks/dodo
```

Headers checked: `webhook-id`, `webhook-signature`, `webhook-timestamp` — the
Standard Webhooks scheme Dodo uses.

Verification is implemented directly in `src/lib/webhookSignature.ts` rather
than through the SDK helper, whose constructor options have changed shape
between SDK versions. The wire format is a published spec and does not move:

```
signed content = `${webhook-id}.${webhook-timestamp}.${raw body}`
signature      = base64(HMAC-SHA256(secret, signed content))
header         = "v1,<sig> v1,<sig2> ..."
```

The check is constant-time, tolerates multiple versioned signatures in the
header, accepts the secret either as `whsec_<base64>` or raw, and rejects any
delivery whose timestamp is more than five minutes from now — so a captured
request cannot be replayed later. It is covered by unit tests in
`tests/webhook.test.mjs` (good signature, tampered body, wrong secret, wrong
id, stale timestamp, missing headers).

The raw request body is read with `request.text()` before any JSON parsing, so
the bytes that were signed are exactly the bytes that are verified.

## 5. Payment verification and ownership

Ownership is **only** written by the webhook path, never by the return URL:

1. Signature verified, or `401`.
2. The delivery is inserted into `payment_events` (`webhook_id` is the primary
   key). A duplicate delivery short-circuits with `{ received: true, duplicate: true }`.
3. `settlePaidBid()` opens a transaction and inserts into `transactions` with a
   unique index on `(provider, provider_payment_id)` — a second webhook for the
   same payment can never settle twice.
4. `SELECT … FOR UPDATE` on the bid, then on the position.
5. The paid amount is compared against the price required **right now**. If it
   fell short (someone else won in the meantime) the bid becomes
   `refund_required` and the board does not move.
6. Otherwise ownership transfers atomically and competing pending bids at or
   below the new price are marked `superseded`.

If processing throws, the `payment_events` row is removed and a `500` is
returned so Dodo retries the delivery.

### Refunds

`refund_required` bids are the only manual step in the system: refund the
payment in the Dodo dashboard. This is rare by design — it needs two people to
pay for the same position within the same few seconds.

## 6. Local testing

1. `DODO_PAYMENTS_ENVIRONMENT=test_mode` and a test API key.
2. Expose your dev server so Dodo can reach the webhook:

   ```bash
   npx localtunnel --port 3000     # or ngrok http 3000
   ```

3. Set `NEXT_PUBLIC_SITE_URL` to the tunnel URL and register the webhook at
   `https://<tunnel>/api/webhooks/dodo`.
4. Claim a position, pay with a Dodo test card, and watch the board update once
   the webhook lands (usually a second or two — the success screen polls).

Useful checks:

```sql
SELECT type, received_at, processed_at FROM payment_events ORDER BY received_at DESC LIMIT 5;
SELECT status, amount_cents, position_slug FROM bids ORDER BY created_at DESC LIMIT 5;
```

## 7. Production setup

- Switch to a live API key and `DODO_PAYMENTS_ENVIRONMENT=live_mode`.
- Re-register the webhook against the production domain and use **that**
  endpoint's signing secret (test and live secrets differ).
- Confirm `NEXT_PUBLIC_SITE_URL` matches the live domain — it builds the
  `return_url`, so a stale value sends payers to the wrong site.
- Do a single real low-value transaction on a pawn before announcing.
