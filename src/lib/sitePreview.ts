import 'server-only';
import { lookup } from 'node:dns/promises';
import { MAX_LOGO_BYTES, readLogo } from './logo';
import { isPrivateAddress, safeExternalUrl } from './urlGuard';

/**
 * Reads a company's own website so the claim form can fill itself in.
 *
 * Everything here is defensive: the URL is vetted, its hostname is resolved and
 * every resulting address range-checked, redirects are followed by hand (a
 * public URL can redirect to 127.0.0.1), the request is time-boxed, and the
 * response is truncated. Failure is always "no preview", never an exception
 * that reaches the caller.
 */

const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const USER_AGENT = 'ChessBidBot/1.0 (+https://chessbid.app)';

/** Tried in order when a site declares no icon <link> of its own. */
const WELL_KNOWN_ICONS = [
  '/apple-touch-icon.png',
  '/apple-touch-icon-precomposed.png',
  '/favicon.ico',
  '/favicon.png',
];

export type SitePreview = {
  name: string | null;
  tagline: string | null;
  logoUrl: string | null;
  siteUrl: string;
};

async function assertPublicHost(url: URL): Promise<void> {
  const records = await lookup(url.hostname, { all: true });
  if (records.length === 0) throw new Error('Host did not resolve');
  for (const record of records) {
    if (isPrivateAddress(record.address)) {
      throw new Error('Host resolves to a private address');
    }
  }
}

/** fetch() with redirects followed manually so every hop is re-validated. */
async function guardedFetch(start: URL, accept: string): Promise<Response> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublicHost(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetch(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: accept },
      });
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) throw new Error('Redirect without a location');
      const next = safeExternalUrl(new URL(location, url).toString());
      if (!next) throw new Error('Redirect to a blocked address');
      url = next;
      continue;
    }
    if (!response.ok) throw new Error(`Upstream returned ${response.status}`);
    return response;
  }
  throw new Error('Too many redirects');
}

async function readCapped(response: Response, limit: number): Promise<Buffer> {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

function meta(html: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      const value = decodeEntities(match[1]).trim();
      if (value) return value;
    }
  }
  return null;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '\u2014',
  ndash: '\u2013',
  hellip: '\u2026',
  rsquo: '\u2019',
  lsquo: '\u2018',
  ldquo: '\u201c',
  rdquo: '\u201d',
};

function decodeOnce(value: string): string {
  return value.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (match, body: string) => {
    if (body.startsWith('#')) {
      const isHex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(isHex ? body.slice(2) : body.slice(1), isHex ? 16 : 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return match;
      try {
        return String.fromCodePoint(code);
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/**
 * Decodes twice. Sites routinely serve double-encoded meta content - an
 * og:description containing "&amp;#38;" is really "&", and a single pass would
 * leave the visible "&#38;" that showed up in the claim form.
 */
function decodeEntities(value: string): string {
  const once = decodeOnce(value);
  const twice = decodeOnce(once);
  return twice === once ? once : decodeOnce(twice);
}

function tag(property: string): RegExp[] {
  return [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`,
      'i',
    ),
  ];
}

export async function fetchSitePreview(input: string): Promise<SitePreview | null> {
  const url = safeExternalUrl(input);
  if (!url) return null;

  try {
    const response = await guardedFetch(url, 'text/html,application/xhtml+xml');
    const body = await readCapped(response, MAX_HTML_BYTES);
    const html = body.toString('utf8').slice(0, MAX_HTML_BYTES);
    const head = html.split(/<\/head>/i)[0] ?? html;

    const name =
      meta(head, tag('og:site_name')) ??
      meta(head, tag('application-name')) ??
      meta(head, tag('og:title')) ??
      meta(head, [/<title[^>]*>([^<]+)<\/title>/i]);

    const tagline =
      meta(head, tag('og:description')) ??
      meta(head, tag('twitter:description')) ??
      meta(head, tag('description'));

    // Only real site icons - never og:image. A share banner is a 1200x630
    // marketing card; putting one where a square mark belongs is what made
    // the claim form show a wide screenshot instead of a logo.
    const candidates: string[] = [];
    const declared = bestIconHref(head);
    if (declared) candidates.push(new URL(declared, url).toString());
    for (const path of WELL_KNOWN_ICONS) {
      const absolute = new URL(path, url).toString();
      if (!candidates.includes(absolute)) candidates.push(absolute);
    }

    // Resolve to one that actually downloads and is a real image, so the
    // preview thumbnail never shows a broken icon and the claim cannot fail
    // later on a logo we already promised.
    const logoUrl = await firstUsableIcon(candidates);

    return {
      name: name ? clip(stripSuffix(name), 60) : null,
      tagline: tagline ? clip(tagline, 90) : null,
      logoUrl,
      siteUrl: url.toString(),
    };
  } catch {
    return null;
  }
}

/**
 * Picks the best <link> icon in the document head.
 *
 * Ranked by kind (an apple-touch-icon is a real square logo; a generic favicon
 * is often 16px), then by declared size. SVG counts as large because it scales.
 */
function bestIconHref(head: string): string | null {
  const links = head.match(/<link\b[^>]*>/gi);
  if (!links) return null;

  let bestHref: string | null = null;
  let bestScore = -1;

  for (const link of links) {
    const rel = attr(link, 'rel')?.toLowerCase();
    const href = attr(link, 'href');
    if (!rel || !href) continue;

    const kinds = rel.split(/\s+/);
    let score: number;
    if (kinds.includes('apple-touch-icon') || kinds.includes('apple-touch-icon-precomposed')) {
      score = 300;
    } else if (kinds.includes('icon') || kinds.includes('shortcut')) {
      score = 200;
    } else if (kinds.includes('mask-icon')) {
      score = 50;
    } else {
      continue;
    }

    const type = attr(link, 'type')?.toLowerCase() ?? '';
    if (type.includes('svg') || href.toLowerCase().endsWith('.svg')) {
      score += 90; // scales to any size
    } else if (type.includes('png') || href.toLowerCase().includes('.png')) {
      score += 20;
    }

    const sizes = attr(link, 'sizes')?.toLowerCase();
    if (sizes === 'any') {
      score += 90;
    } else if (sizes) {
      const pixels = Number.parseInt(sizes.split(/[x\s]/)[0] ?? '', 10);
      if (Number.isFinite(pixels)) score += Math.min(pixels, 512) / 8;
    }

    if (score > bestScore) {
      bestScore = score;
      bestHref = href;
    }
  }

  return bestHref;
}

function attr(tagHtml: string, name: string): string | null {
  const quoted = new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tagHtml);
  if (quoted?.[1] != null) return decodeEntities(quoted[1]).trim() || null;
  const bare = new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, 'i').exec(tagHtml);
  return bare?.[1] ? decodeEntities(bare[1]).trim() || null : null;
}

/** "ACME AI | Home" and "ACME AI - Developer tools" both mean "ACME AI". */
function stripSuffix(title: string): string {
  const parts = title.split(/\s+[|–—-]\s+/);
  return (parts[0] ?? title).trim() || title.trim();
}

function clip(value: string, max: number): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/**
 * Returns the first candidate that downloads and passes the image check.
 * Sites 404 their /favicon.ico all the time, so trying is the only way to know.
 */
async function firstUsableIcon(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates.slice(0, 4)) {
    const logo = await fetchRemoteLogo(candidate);
    if (logo) return candidate;
  }
  return null;
}

/** Downloads a remote image for use as a logo, with the same protections. */
export async function fetchRemoteLogo(
  input: string,
): Promise<{ mime: string; bytes: Buffer } | null> {
  const url = safeExternalUrl(input);
  if (!url) return null;
  try {
    const response = await guardedFetch(url, 'image/*');
    const bytes = await readCapped(response, MAX_LOGO_BYTES);
    if (bytes.length === 0) return null;
    const file = new File([new Uint8Array(bytes)], 'logo', { type: 'application/octet-stream' });
    const result = await readLogo(file);
    return result.ok ? { mime: result.mime, bytes: result.bytes } : null;
  } catch {
    return null;
  }
}
