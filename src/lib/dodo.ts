import 'server-only';
import DodoPayments from 'dodopayments';
import { currency, dodoConfig, siteUrl } from './config';
import { assertValidSignature, type SignatureHeaders } from './webhookSignature';

/**
 * The SDK is talked to through a narrow structural type rather than its own
 * generated types. That keeps a minor-version bump in the SDK from breaking
 * the build, and documents the single call ChessBid depends on. Webhook
 * signatures are verified in ./webhookSignature.ts instead of via the SDK,
 * whose webhook options have changed shape between versions.
 */
type DodoClient = {
  checkoutSessions: {
    create(body: Record<string, unknown>): Promise<{
      session_id?: string;
      checkout_url?: string | null;
    }>;
  };
};

let cached: DodoClient | null = null;

/** Lazily constructed so a missing key never breaks the build, only the call. */
export function dodo(): DodoClient {
  if (!cached) {
    cached = new DodoPayments({
      bearerToken: dodoConfig.apiKey,
      environment: dodoConfig.environment,
    }) as unknown as DodoClient;
  }
  return cached;
}

export type CheckoutArgs = {
  bidId: string;
  slug: string;
  amountCents: number;
  email: string;
  handle: string;
};

/**
 * Creates a Dodo checkout session for one bid.
 *
 * ChessBid uses a single "pay what you want" product and sends the
 * server-computed amount per session, so prices can move without creating a
 * product per bid. `metadata.bid_id` is the only link the webhook needs.
 */
export async function createCheckout(args: CheckoutArgs): Promise<{
  sessionId: string;
  checkoutUrl: string;
}> {
  const session = await dodo().checkoutSessions.create({
    product_cart: [
      {
        product_id: dodoConfig.productId,
        quantity: 1,
        amount: args.amountCents,
      },
    ],
    customer: {
      email: args.email,
      name: args.handle,
    },
    return_url: `${siteUrl}/${args.slug}?paid=${args.bidId}`,
    cancel_url: `${siteUrl}/${args.slug}?cancelled=1`,
    billing_currency: currency,
    metadata: {
      bid_id: args.bidId,
      position_slug: args.slug,
      handle: args.handle,
    },
  });

  const sessionId = session.session_id;
  const checkoutUrl = session.checkout_url;

  if (!sessionId || !checkoutUrl) {
    throw new Error('Dodo did not return a usable checkout session');
  }
  return { sessionId, checkoutUrl };
}

export type DodoWebhookHeaders = SignatureHeaders;

export type NormalisedPaymentEvent = {
  type: string;
  paymentId: string | null;
  status: string | null;
  amountCents: number | null;
  currency: string | null;
  bidId: string | null;
  raw: unknown;
};

/**
 * Verifies the signature and flattens the parts of the payload ChessBid uses.
 * Throws when the signature does not check out.
 */
export function verifyWebhook(
  rawBody: string,
  headers: DodoWebhookHeaders,
): NormalisedPaymentEvent {
  assertValidSignature(dodoConfig.webhookKey, rawBody, headers);

  const payload: unknown = JSON.parse(rawBody);
  const event = payload as {
    type?: string;
    data?: {
      payment_id?: string;
      status?: string;
      total_amount?: number;
      settlement_amount?: number;
      currency?: string;
      metadata?: Record<string, string>;
    };
  };
  const data = event.data ?? {};
  return {
    type: event.type ?? 'unknown',
    paymentId: data.payment_id ?? null,
    status: data.status ?? null,
    amountCents:
      typeof data.total_amount === 'number'
        ? data.total_amount
        : typeof data.settlement_amount === 'number'
          ? data.settlement_amount
          : null,
    currency: data.currency ?? null,
    bidId: data.metadata?.bid_id ?? null,
    raw: payload,
  };
}
