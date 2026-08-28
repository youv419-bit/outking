/**
 * Logos are validated by magic bytes (never by the client-supplied MIME type),
 * capped in size, and stored as bytea. SVG is rejected outright because it can
 * carry script. They are served back from /api/logo/[companyId] with a
 * sandboxing CSP header.
 */

export const MAX_LOGO_BYTES = 256 * 1024; // 256 KB

const SIGNATURES: Array<{ mime: string; test: (b: Uint8Array) => boolean }> = [
  {
    mime: 'image/png',
    test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  },
  {
    mime: 'image/jpeg',
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: 'image/gif',
    test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  },
  {
    // ICO: reserved(0) + type(1 = icon) + image count. Accepted because the
    // fallback logo source is a site's /favicon.ico, and browsers render it.
    mime: 'image/x-icon',
    test: (b) => b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00,
  },
  {
    mime: 'image/webp',
    test: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

export type LogoResult =
  | { ok: true; mime: string; bytes: Buffer }
  | { ok: false; error: string };

export async function readLogo(file: File | null): Promise<LogoResult> {
  if (!file || file.size === 0) {
    return { ok: false, error: 'A logo image is required' };
  }
  if (file.size > MAX_LOGO_BYTES) {
    return { ok: false, error: 'Logo must be 256 KB or smaller' };
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const match = SIGNATURES.find((sig) => sig.test(bytes));
  if (!match) {
    return { ok: false, error: 'Logo must be a PNG, JPEG, GIF, WebP or ICO image' };
  }
  return { ok: true, mime: match.mime, bytes };
}
