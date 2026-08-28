import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeNextBid } from '../src/lib/bidmath.ts';

const next = (current, starting) => computeNextBid(current, starting, 1.1, 500);

test('an unclaimed position costs its starting bid', () => {
  assert.equal(next(null, 25000), 25000);
});

test('the next bid applies the multiplier and rounds up', () => {
  assert.equal(next(10000, 2500), 11000); // 11000 is already a multiple of 500
  assert.equal(next(10300, 2500), 11500); // 11330 -> 11500
});

test('the next bid is always strictly greater than the current bid', () => {
  for (const current of [100, 250, 499, 2500, 99999]) {
    assert.ok(next(current, 2500) > current, `failed at ${current}`);
  }
});

test('a multiplier of 1 still moves the price', () => {
  assert.ok(computeNextBid(10000, 2500, 1, 500) > 10000);
});

test('the next bid is deterministic', () => {
  assert.equal(next(50000, 25000), next(50000, 25000));
});
