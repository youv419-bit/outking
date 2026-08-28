import { z } from 'zod';

const HANDLE = /^[a-zA-Z0-9_]{2,20}$/;

/** Blocks javascript:, data:, and other non-web schemes. */
const httpUrl = z
  .string()
  .trim()
  .min(4)
  .max(200)
  .transform((value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`))
  .refine((value) => {
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      return url.hostname.includes('.') && !url.hostname.endsWith('.');
    } catch {
      return false;
    }
  }, 'Enter a valid website URL');

export const claimSchema = z.object({
  slug: z.string().trim().min(1).max(40),
  handle: z
    .string()
    .trim()
    .regex(HANDLE, 'Letters, numbers and underscores only (2-20 characters)'),
  email: z.string().trim().email('Enter a valid email').max(160),
  companyName: z.string().trim().min(1, 'Required').max(60),
  tagline: z.string().trim().min(1, 'Required').max(90),
  websiteUrl: httpUrl,
  xUsername: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      const stripped = value.replace(/^@/, '');
      return HANDLE.test(stripped) ? stripped : undefined;
    }),
});

export type ClaimInput = z.infer<typeof claimSchema>;

/**
 * Strips control characters that could corrupt rendering or log output.
 * Written as a code-point scan rather than a regex so the source file itself
 * stays free of literal control characters.
 */
export function clean(value: string): string {
  let out = '';
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    out += ch;
  }
  return out.trim();
}
