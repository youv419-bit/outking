/**
 * Central runtime configuration. Every value that touches money or identity
 * is read on the server only; nothing here is bundled into the client except
 * what is explicitly re-exported through `publicConfig`.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const siteUrl = (
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
).replace(/\/+$/, '');

export const currency = optional('BID_CURRENCY', 'USD').toUpperCase();

/** Next bid = ceil(current * multiplier) rounded up to `roundingCents`. */
export const bidMultiplier = (() => {
  const raw = Number(optional('BID_MULTIPLIER', '1.10'));
  if (!Number.isFinite(raw) || raw <= 1) return 1.1;
  return raw;
})();

export const bidRoundingCents = (() => {
  const raw = Number(optional('BID_ROUNDING_CENTS', '100'));
  if (!Number.isInteger(raw) || raw < 1) return 500;
  return raw;
})();

export const dodoConfig = {
  get apiKey() {
    return required('DODO_PAYMENTS_API_KEY');
  },
  get webhookKey() {
    return required('DODO_PAYMENTS_WEBHOOK_KEY');
  },
  get productId() {
    return required('DODO_PRODUCT_ID');
  },
  get environment(): 'test_mode' | 'live_mode' {
    return optional('DODO_PAYMENTS_ENVIRONMENT', 'test_mode') === 'live_mode'
      ? 'live_mode'
      : 'test_mode';
  },
};

export const sessionSecret = () => required('SESSION_SECRET');

/** Safe to expose to the browser. */
export const publicConfig = {
  siteUrl,
  currency,
  bidMultiplier,
};

/**
 * Names of the environment variables that must be present before anyone can
 * claim or outbid. Reported by /api/health and checked by /api/claim, so a
 * missing variable surfaces as "not configured" instead of masquerading as a
 * payment-provider outage.
 */
export const REQUIRED_PAYMENT_ENV = [
  'SESSION_SECRET',
  'DODO_PAYMENTS_API_KEY',
  'DODO_PAYMENTS_WEBHOOK_KEY',
  'DODO_PRODUCT_ID',
] as const;

export function missingPaymentEnv(): string[] {
  return REQUIRED_PAYMENT_ENV.filter((name) => !process.env[name]);
}

export const brand = {
  name: 'ChessBid',
  tagline: 'Own the piece. Defend it. Outbid anyone who wants it.',
  description:
    'ChessBid is a 3D chessboard with 16 ownable positions. Claim a piece, put your brand on it, and hold it until someone pays more.',
  twitter: '@chessbid',
};
