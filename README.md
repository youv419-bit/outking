# Outking

Pay-to-rank leaderboard with a **top-20 bubble wall** (10 left + 10 right), live at outking.lol.

Functionality follows the public outbid-style rules. Checkout is **Dodo Payments**. Host is **Railway**.

This is not the outbid.lol brand. Same *mechanic*, different product shell.

## How ranking works

1. Visitor pastes a product URL or `@handle`, picks a category, sets a whole-dollar amount.
2. Server computes what they actually owe:
   - New listing: they pay the amount they typed ($1 minimum).
   - Existing listing: they pay only the **difference**.
   - Taking #1 requires **$1 more** than the current #1 (same $1-step rule as every other rank).
3. Server creates a Dodo **Checkout Session** with Pay-What-You-Want `amount` in cents.
4. Visitor pays on Dodo. Card data never hits this app.
5. Dodo sends `payment.succeeded` to `/webhook/dodo`.
6. Webhook adds the paid dollars to that listing. The board re-sorts: highest lifetime total is #1. Ties keep the older listing higher.
7. The same payment also counts on **Today** (rolling 24h) and **Daily** (UTC day).
8. Outbound clicks go through `/go/:slug` so click counts increment.

## Pages

| Path | Purpose |
|---|---|
| `/` | All-time board + bubble rails |
| `/today` | Rolling 24-hour spend board |
| `/daily` | UTC calendar-day board |
| `/categories` | Category index |
| `/category/:slug` | Category board |
| `/product/:slug` | Listing detail |
| `/faq` `/rules` `/about` `/terms` `/privacy` | Policy pages |
| `/success` | Return URL after Dodo |
| `/webhook/dodo` | Dodo webhook |

## Local run

```bash
cd rankwall
cp .env.example .env
npm install
npm start
```

(The folder is still named `rankwall` on disk — that's fine, it's just the project directory name and doesn't show up anywhere in the UI.)

Open http://localhost:3000

If Dodo keys are missing, checkout runs in **demo mode** and applies the rank immediately so you can test the UI.

## Dodo Payments setup

1. Create an account at https://app.dodopayments.com
2. **Products → New product**
   - Type: one-time
   - Enable **Pay What You Want**
   - Min $1, max $999999
3. Copy the product id (`pdt_...`) into `DODO_PRODUCT_ID`
4. Developer → API keys → `DODO_PAYMENTS_API_KEY`
5. Developer → Webhooks → Add endpoint
   - URL: `https://YOUR-RAILWAY-DOMAIN/webhook/dodo`
   - Event: `payment.succeeded`
   - Copy signing secret into `DODO_PAYMENTS_WEBHOOK_KEY`
6. Set `DODO_ENVIRONMENT=test_mode` until a live key is ready, then `live_mode`

## Railway deploy

1. Push this folder to GitHub.
2. New Railway project → Deploy from GitHub.
3. Railway detects Node via `package.json` / `Procfile`.
4. Data is stored in a single JSON file (see `store.js`). Add a **volume** mounted at `/data` so it survives restarts/redeploys, and point `DATABASE_PATH` at a file inside it.
5. Set environment variables:

```
APP_URL=https://outking.lol
APP_NAME=Outking
CONTACT_EMAIL=you@example.com
DATABASE_PATH=/data/outking.json
DODO_PAYMENTS_API_KEY=...
DODO_PAYMENTS_WEBHOOK_KEY=...
DODO_PRODUCT_ID=pdt_...
DODO_ENVIRONMENT=test_mode
MAINTENANCE_MODE=false
MAINTENANCE_BYPASS_TOKEN=your_own_secret_token
```

6. Deploy. Open the generated URL.
7. Point Dodo’s webhook at `https://your-service.up.railway.app/webhook/dodo`.

## Environment

See `.env.example`.

## Notes

- The board starts empty — no demo/seed listings ship. `store.js` also strips any leftover seed listings from an older deploy's data file on boot, so an existing volume gets cleaned automatically on the next start.
- If a submitted URL doesn't include a title, the server makes a best-effort attempt to fetch the page and read its `<title>` (3s timeout, falls back to the hostname if that fails or the site blocks it).
- Query strings are stripped from submitted URLs.
- Chat invite hosts are blocked.
- Payments are treated as final in the FAQ/terms copy. Configure refunds in Dodo if you ever change that.
- Maintenance mode: set `MAINTENANCE_MODE=true` and `MAINTENANCE_BYPASS_TOKEN=<secret>`, then visit `/?bypass=<secret>` once in your own browser to set a bypass cookie while everyone else sees the maintenance page.
