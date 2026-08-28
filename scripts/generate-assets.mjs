#!/usr/bin/env node
/**
 * Rasterises the brand assets from public/logo.svg.
 * Run with: node scripts/generate-assets.mjs   (requires sharp)
 * The generated files are committed, so this only needs re-running when the
 * logo changes.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, '..', 'public');

const BG = { r: 5, g: 5, b: 6, alpha: 1 };

async function main() {
  await mkdir(publicDir, { recursive: true });
  const logo = await readFile(join(publicDir, 'logo.svg'));

  const icon = async (size, pad) =>
    sharp({
      create: { width: size, height: size, channels: 4, background: BG },
    })
      .composite([
        {
          input: await sharp(logo)
            .resize(Math.round(size * pad), Math.round(size * pad), {
              fit: 'contain',
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .png()
            .toBuffer(),
          gravity: 'center',
        },
      ])
      .png();

  await (await icon(512, 0.68)).toFile(join(publicDir, 'icon-512.png'));
  await (await icon(192, 0.68)).toFile(join(publicDir, 'icon-192.png'));
  await (await icon(180, 0.7)).toFile(join(publicDir, 'apple-touch-icon.png'));
  await (await icon(512, 0.52)).toFile(join(publicDir, 'icon-maskable-512.png'));
  await (await icon(64, 0.72)).toFile(join(publicDir, 'icon-64.png'));
  await (await icon(32, 0.78)).toFile(join(publicDir, 'icon-32.png'));

  // A minimal multi-size .ico built by hand (PNG-compressed entries).
  const sizes = [16, 32, 48];
  const images = [];
  for (const size of sizes) {
    images.push({ size, data: await (await icon(size, 0.78)).toBuffer() });
  }
  await writeFile(join(publicDir, 'favicon.ico'), buildIco(images));

  console.log('[assets] icons written');
}

function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  const payloads = [];
  let offset = 6 + images.length * 16;

  for (const { size, data } of images) {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt8(0, 2);
    entry.writeUInt8(0, 3);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    entries.push(entry);
    payloads.push(data);
    offset += data.length;
  }

  return Buffer.concat([header, ...entries, ...payloads]);
}

main().catch((err) => {
  console.error('[assets]', err);
  process.exit(1);
});
