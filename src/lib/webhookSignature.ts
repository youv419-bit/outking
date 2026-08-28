import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Standard Webhooks signature verification (the scheme Dodo Payments uses).
 *
 * Implemented directly rather than through the SDK's helper: the helper's
 * options have moved between SDK versions, while the wire format below is a
 * published specification that does not move.
 *
 *   signed content = `${webhook-id}.${webhook-timestamp}.${raw body}`
 *   signature      = base64(HMAC-SHA256(secret, signed content))
 *   header         = "v1,<sig> v1,<sig2> ..."  (space separated, versioned)
 *
 * No imports beyond node:crypto, so it can be unit-tested in isolation.
 */

export const WEBHOOK_TOLERANCE_SECONDS = 5 * 60;

export type SignatureHeaders = {
  'webhook-id': string;
  'webhook-signature': string;
  'webhook-timestamp': string;
};

/**
 * Secrets are conventionally `whsec_<base64>`. Some dashboards hand out the
 * raw string instead, so both interpretations are derived from the one secret
 * and either may match - it is the same secret either way, not a weaker check.
 */
function candidateKeys(secret: string): Buffer[] {
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const keys: Buffer[] = [];
  const decoded = Buffer.from(raw, 'base64');
  if (decoded.length > 0) keys.push(decoded);
  keys.push(Buffer.from(raw, 'utf8'));
  return keys;
}

function equals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function sign(secret: string, id: string, timestamp: string, body: string): string {
  const key = candidateKeys(secret)[0];
  return createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64');
}

/** Throws with a specific reason when the delivery cannot be trusted. */
export function assertValidSignature(
  secret: string,
  rawBody: string,
  headers: SignatureHeaders,
  nowSeconds: number = Date.now() / 1000,
): void {
  const id = headers['webhook-id'];
  const timestamp = headers['webhook-timestamp'];
  const header = headers['webhook-signature'];
  if (!id || !timestamp || !header) {
    throw new Error('Webhook is missing signature headers');
  }

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) {
    throw new Error('Webhook timestamp is not a number');
  }
  if (Math.abs(nowSeconds - sent) > WEBHOOK_TOLERANCE_SECONDS) {
    throw new Error('Webhook timestamp is outside the replay tolerance');
  }

  const signedContent = `${id}.${timestamp}.${rawBody}`;
  const expected = candidateKeys(secret).map((key) =>
    createHmac('sha256', key).update(signedContent).digest('base64'),
  );

  // "v1,<sig>" entries, space separated; unversioned values are tolerated.
  const provided = header
    .split(' ')
    .map((part) => (part.includes(',') ? part.slice(part.indexOf(',') + 1) : part))
    .filter(Boolean);

  const matched = provided.some((candidate) =>
    expected.some((value) => equals(candidate, value)),
  );
  if (!matched) {
    throw new Error('Webhook signature does not match');
  }
}
