import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHmac } from 'node:crypto';
import {
  assertValidSignature,
  sign,
  WEBHOOK_TOLERANCE_SECONDS,
} from '../src/lib/webhookSignature.ts';

const SECRET = 'whsec_' + Buffer.from('a-very-secret-key').toString('base64');
const ID = 'msg_123';
const BODY = JSON.stringify({ type: 'payment.succeeded', data: { payment_id: 'pay_1' } });
const NOW = 1_700_000_000;

function headers(signature, timestamp = String(NOW)) {
  return {
    'webhook-id': ID,
    'webhook-signature': signature,
    'webhook-timestamp': timestamp,
  };
}

test('accepts a correctly signed delivery', () => {
  const signature = `v1,${sign(SECRET, ID, String(NOW), BODY)}`;
  assert.doesNotThrow(() => assertValidSignature(SECRET, BODY, headers(signature), NOW));
});

test('accepts one good signature among several', () => {
  const good = sign(SECRET, ID, String(NOW), BODY);
  const signature = `v1,AAAAdeadbeef v1,${good}`;
  assert.doesNotThrow(() => assertValidSignature(SECRET, BODY, headers(signature), NOW));
});

test('rejects a tampered body', () => {
  const signature = `v1,${sign(SECRET, ID, String(NOW), BODY)}`;
  assert.throws(
    () => assertValidSignature(SECRET, BODY.replace('pay_1', 'pay_2'), headers(signature), NOW),
    /does not match/,
  );
});

test('rejects a signature made with another secret', () => {
  const signature = `v1,${sign('whsec_' + Buffer.from('wrong').toString('base64'), ID, String(NOW), BODY)}`;
  assert.throws(() => assertValidSignature(SECRET, BODY, headers(signature), NOW), /does not match/);
});

test('rejects a replayed delivery outside the tolerance', () => {
  const old = String(NOW - WEBHOOK_TOLERANCE_SECONDS - 1);
  const signature = `v1,${sign(SECRET, ID, old, BODY)}`;
  assert.throws(
    () => assertValidSignature(SECRET, BODY, headers(signature, old), NOW),
    /replay tolerance/,
  );
});

test('rejects a mismatched webhook id', () => {
  const signature = `v1,${sign(SECRET, 'msg_other', String(NOW), BODY)}`;
  assert.throws(() => assertValidSignature(SECRET, BODY, headers(signature), NOW), /does not match/);
});

test('accepts a raw (non base64) secret', () => {
  const raw = 'plain-text-secret';
  const expected = createHmac('sha256', Buffer.from(raw, 'base64'))
    .update(`${ID}.${NOW}.${BODY}`)
    .digest('base64');
  assert.doesNotThrow(() =>
    assertValidSignature(raw, BODY, headers(`v1,${expected}`), NOW),
  );
});

test('rejects missing headers', () => {
  assert.throws(
    () => assertValidSignature(SECRET, BODY, { 'webhook-id': '', 'webhook-signature': '', 'webhook-timestamp': '' }, NOW),
    /missing signature headers/,
  );
});
