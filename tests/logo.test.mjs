import assert from 'node:assert/strict';
import { test } from 'node:test';

const { readLogo, MAX_LOGO_BYTES } = await import('../src/lib/logo.ts');

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const SVG = Buffer.from('<svg onload="alert(1)"></svg>');

function file(bytes, name, type) {
  return new File([bytes], name, { type });
}

test('accepts a real PNG', async () => {
  const result = await readLogo(file(PNG, 'logo.png', 'image/png'));
  assert.equal(result.ok, true);
  assert.equal(result.mime, 'image/png');
});

test('accepts a real JPEG even when the client lies about the type', async () => {
  const result = await readLogo(file(JPEG, 'logo.png', 'image/png'));
  assert.equal(result.ok, true);
  assert.equal(result.mime, 'image/jpeg');
});

test('rejects SVG (it can carry script)', async () => {
  const result = await readLogo(file(SVG, 'logo.svg', 'image/svg+xml'));
  assert.equal(result.ok, false);
});

test('rejects an oversized file', async () => {
  const big = Buffer.concat([PNG, Buffer.alloc(MAX_LOGO_BYTES)]);
  const result = await readLogo(file(big, 'logo.png', 'image/png'));
  assert.equal(result.ok, false);
});

test('rejects an empty upload', async () => {
  const result = await readLogo(null);
  assert.equal(result.ok, false);
});
