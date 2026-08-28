import 'server-only';
import type { PoolClient } from 'pg';
import { transaction } from './db';
import { nextBidCents } from './money';

export type SettlementResult =
  | { status: 'transferred'; slug: string; amountCents: number; handle: string }
  | { status: 'duplicate' }
  | { status: 'unknown_bid' }
  | { status: 'already_settled' }
  | { status: 'underpaid'; expectedCents: number; paidCents: number }
  | { status: 'insufficient'; requiredCents: number; bidCents: number };

type BidRow = {
  id: string;
  position_slug: string;
  user_id: string;
  company_id: string;
  amount_cents: number;
  currency: string;
  status: string;
};

type PositionRow = {
  slug: string;
  starting_bid_cents: number;
  current_bid_cents: number | null;
  owner_user_id: string | null;
};

/**
 * The only place ownership ever changes.
 *
 * Called exclusively from the verified webhook handler. Three layers guard it:
 *  1. `payment_events.webhook_id` primary key  — the same delivery is ignored.
 *  2. `transactions.provider_payment_id` unique index — the same payment is
 *     ignored even if it arrives under a different webhook id.
 *  3. `SELECT ... FOR UPDATE` on the bid and the position — two payments that
 *     land at the same instant are serialised, and the second one is measured
 *     against the price the first one just set.
 */
export async function settlePaidBid(args: {
  bidId: string;
  paymentId: string;
  /** What the provider reported, in the provider's own currency. */
  providerAmountCents: number;
  providerCurrency: string;
}): Promise<SettlementResult> {
  return transaction(async (client: PoolClient) => {
    const claimed = await client.query(
      `INSERT INTO transactions (bid_id, provider, provider_payment_id, amount_cents, currency, status)
       VALUES ($1, 'dodo', $2, $3, $4, 'succeeded')
       ON CONFLICT (provider, provider_payment_id) DO NOTHING
       RETURNING id`,
      [args.bidId, args.paymentId, args.providerAmountCents, args.providerCurrency],
    );
    if (claimed.rowCount === 0) {
      return { status: 'duplicate' } as const;
    }

    const bidResult = await client.query<BidRow>(
      `SELECT id, position_slug, user_id, company_id, amount_cents, currency, status
         FROM bids WHERE id = $1 FOR UPDATE`,
      [args.bidId],
    );
    const bid = bidResult.rows[0];
    if (!bid) return { status: 'unknown_bid' } as const;
    if (bid.status !== 'pending') return { status: 'already_settled' } as const;

    // The new price is the amount ChessBid asked for, NOT the number the
    // provider echoes back. Those are only the same when the payment settles
    // in our currency; with adaptive pricing the provider reports the local
    // amount (e.g. INR paise), and storing that as the bid would show a $50
    // position as $5,860.
    const priceCents = bid.amount_cents;

    // When the currencies DO match we can meaningfully compare - pay-what-you-
    // want checkouts let a customer type a lower number, and that must not buy
    // the position.
    if (
      args.providerCurrency.toUpperCase() === bid.currency.toUpperCase() &&
      args.providerAmountCents > 0 &&
      args.providerAmountCents < priceCents
    ) {
      await client.query(
        `UPDATE bids SET status = 'refund_required', settled_at = now() WHERE id = $1`,
        [bid.id],
      );
      return {
        status: 'underpaid',
        expectedCents: priceCents,
        paidCents: args.providerAmountCents,
      } as const;
    }

    const positionResult = await client.query<PositionRow>(
      `SELECT slug, starting_bid_cents, current_bid_cents, owner_user_id
         FROM positions WHERE slug = $1 FOR UPDATE`,
      [bid.position_slug],
    );
    const position = positionResult.rows[0];
    if (!position) return { status: 'unknown_bid' } as const;

    const required = nextBidCents(position.current_bid_cents, position.starting_bid_cents);
    if (priceCents < required) {
      // Someone else won the position between checkout and settlement.
      await client.query(
        `UPDATE bids SET status = 'refund_required', settled_at = now() WHERE id = $1`,
        [bid.id],
      );
      return { status: 'insufficient', requiredCents: required, bidCents: priceCents } as const;
    }

    await client.query(
      `UPDATE ownership SET released_at = now()
        WHERE position_slug = $1 AND released_at IS NULL`,
      [bid.position_slug],
    );

    await client.query(
      `UPDATE positions
          SET current_bid_cents = $2,
              owner_user_id     = $3,
              owner_company_id  = $4,
              ownership_changes = ownership_changes + 1,
              owned_since       = now(),
              updated_at        = now()
        WHERE slug = $1`,
      [bid.position_slug, priceCents, bid.user_id, bid.company_id],
    );

    await client.query(
      `INSERT INTO ownership (position_slug, user_id, company_id, bid_cents)
       VALUES ($1, $2, $3, $4)`,
      [bid.position_slug, bid.user_id, bid.company_id, priceCents],
    );

    await client.query(
      `UPDATE bids SET status = 'paid', settled_at = now() WHERE id = $1`,
      [bid.id],
    );

    // Any other pending bid on this position at or below the new price is dead.
    await client.query(
      `UPDATE bids SET status = 'superseded'
        WHERE position_slug = $1 AND status = 'pending'
          AND id <> $2 AND amount_cents <= $3`,
      [bid.position_slug, bid.id, priceCents],
    );

    const handleResult = await client.query<{ handle: string }>(
      'SELECT handle FROM users WHERE id = $1',
      [bid.user_id],
    );

    return {
      status: 'transferred',
      slug: bid.position_slug,
      amountCents: priceCents,
      handle: handleResult.rows[0]?.handle ?? '',
    } as const;
  });
}

export async function markBidFailed(bidId: string): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      `UPDATE bids SET status = 'failed', settled_at = now()
        WHERE id = $1 AND status = 'pending'`,
      [bidId],
    );
  });
}
