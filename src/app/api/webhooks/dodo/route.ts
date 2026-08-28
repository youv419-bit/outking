import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { verifyWebhook } from '@/lib/dodo';
import { markBidFailed, settlePaidBid } from '@/lib/ownership';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The only endpoint allowed to move ownership.
 *
 * Order of operations matters: verify the signature first, then record the
 * delivery (the primary key on webhook_id rejects replays), then settle.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  const webhookId = request.headers.get('webhook-id');
  const signature = request.headers.get('webhook-signature');
  const timestamp = request.headers.get('webhook-timestamp');
  if (!webhookId || !signature || !timestamp) {
    return NextResponse.json({ error: 'Missing webhook headers' }, { status: 400 });
  }

  let event;
  try {
    event = verifyWebhook(rawBody, {
      'webhook-id': webhookId,
      'webhook-signature': signature,
      'webhook-timestamp': timestamp,
    });
  } catch (error) {
    console.warn('[webhook] signature rejected', error);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  // Idempotency layer 1: the same delivery is never processed twice.
  const recorded = await pool().query(
    `INSERT INTO payment_events (webhook_id, type, payload)
     VALUES ($1, $2, $3)
     ON CONFLICT (webhook_id) DO NOTHING
     RETURNING webhook_id`,
    [webhookId, event.type, JSON.stringify(event.raw)],
  );
  if (recorded.rowCount === 0) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    if (event.type === 'payment.succeeded' && event.bidId && event.paymentId) {
      const result = await settlePaidBid({
        bidId: event.bidId,
        paymentId: event.paymentId,
        providerAmountCents: event.amountCents ?? 0,
        providerCurrency: event.currency ?? 'USD',
      });
      if (result.status === 'insufficient') {
        console.warn(
          `[webhook] bid ${event.bidId} was for ${result.bidCents} but ${result.requiredCents} is now required - flagged for refund`,
        );
      } else if (result.status === 'underpaid') {
        console.warn(
          `[webhook] bid ${event.bidId} expected ${result.expectedCents} but only ${result.paidCents} was paid - flagged for refund`,
        );
      }
    } else if (
      (event.type === 'payment.failed' || event.type === 'payment.cancelled') &&
      event.bidId
    ) {
      await markBidFailed(event.bidId);
    }

    await pool().query(
      'UPDATE payment_events SET processed_at = now() WHERE webhook_id = $1',
      [webhookId],
    );
  } catch (error) {
    console.error('[webhook] processing failed', error);
    // Release the idempotency slot so Dodo's retry can be processed.
    await pool()
      .query('DELETE FROM payment_events WHERE webhook_id = $1 AND processed_at IS NULL', [
        webhookId,
      ])
      .catch(() => {});
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
