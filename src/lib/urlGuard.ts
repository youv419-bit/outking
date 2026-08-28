/**
 * Guards for server-side fetching of user-supplied URLs.
 *
 * The claim form lets people paste their website and have ChessBid read its
 * logo and description. That means the server makes a request to an address a
 * stranger chose, which is a server-side request forgery risk: without these
 * checks someone could point it at the cloud metadata endpoint or an internal
 * service and have the response handed back to them.
 *
 * No imports, so it can be unit-tested on its own.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata.google.internal',
  'metadata.goog',
]);

const BLOCKED_SUFFIXES = ['.local', '.internal', '.localhost', '.home.arpa'];

/** True for an address that must never be fetched. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.trim().toLowerCase();

  // IPv6
  if (ip.includes(':')) {
    if (ip === '::' || ip === '::1') return true;
    if (ip.startsWith('fe80') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
    // IPv4-mapped IPv6, e.g. ::ffff:169.254.169.254
    const mapped = ip.split(':').pop();
    if (mapped && mapped.includes('.')) return isPrivateAddress(mapped);
    return false;
  }

  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  const octets = parts.map((part) => Number(part));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = octets as [number, number, number, number];

  if (a === 0) return true; // this network
  if (a === 10) return true; // private
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier NAT
  if (a === 192 && b === 0) return true; // IETF protocol assignments
  if (a >= 224) return true; // multicast + reserved
  return false;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (BLOCKED_HOSTNAMES.has(host)) return true;
  if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) return true;
  // A bare IP literal in the URL still has to pass the range check.
  if (/^[\d.]+$/.test(host) || host.includes(':')) return isPrivateAddress(host);
  return false;
}

/** Parses and vets a user-supplied URL. Returns null when it must not be fetched. */
export function safeExternalUrl(input: string): URL | null {
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (isBlockedHostname(url.hostname)) return null;
  if (!url.hostname.includes('.')) return null;
  return url;
}
