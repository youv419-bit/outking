'use client';

import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { formatMoney } from '@/lib/format';
import type { PositionView } from '@/lib/types';

type Props = {
  position: PositionView;
  currency: string;
  isViewerOwner: boolean;
  onClose: () => void;
};

const MAX_LOGO_BYTES = 256 * 1024;

type Preview = { name: string | null; tagline: string | null; logoUrl: string | null };

export default function ClaimForm({ position, currency, isViewerOwner, onClose }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [looking, setLooking] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [logoFileName, setLogoFileName] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const lastLookup = useRef<string>('');
  const outbid = position.isOwned;

  /**
   * Reads the company's own site for its name, description and logo, so most
   * of this form fills itself in. Purely additive: it never overwrites
   * something already typed, and a site we cannot read is not an error.
   */
  async function lookupSite(rawUrl: string) {
    const value = rawUrl.trim();
    if (!value || value === lastLookup.current) return;
    lastLookup.current = value;
    setLooking(true);
    try {
      const response = await fetch(`/api/site-preview?url=${encodeURIComponent(value)}`);
      if (!response.ok) {
        setLooking(false);
        return;
      }
      const data = (await response.json()) as Preview;
      setPreview(data);

      const form = formRef.current;
      if (form) {
        const name = form.elements.namedItem('companyName') as HTMLInputElement | null;
        const tagline = form.elements.namedItem('tagline') as HTMLInputElement | null;
        if (name && !name.value && data.name) name.value = data.name;
        if (tagline && !tagline.value && data.tagline) tagline.value = data.tagline;
      }
    } catch {
      /* a site we cannot read is not an error - the fields stay manual */
    }
    setLooking(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = new FormData(event.currentTarget);
    form.set('slug', position.slug);

    const logo = form.get('logo');
    const hasFile = logo instanceof File && logo.size > 0;

    if (hasFile && logo.size > MAX_LOGO_BYTES) {
      setError('Logo must be 256 KB or smaller.');
      return;
    }
    if (!hasFile && preview?.logoUrl) {
      form.set('logoUrl', preview.logoUrl);
    }
    if (!hasFile && !preview?.logoUrl) {
      setError('Add a logo image, or enter a website we can read one from.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/claim', { method: 'POST', body: form });
      const data = (await response.json()) as { checkoutUrl?: string; error?: string };
      if (!response.ok || !data.checkoutUrl) {
        setError(data.error ?? 'Something went wrong. Try again.');
        setSubmitting(false);
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setError('Network error. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`${isViewerOwner ? 'Raise your bid on' : outbid ? 'Outbid' : 'Claim'} the ${position.label}`}
    >
      <div className="glass animate-riseIn max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-2xl scroll-slim">
        <div className="flex items-start justify-between gap-4 border-b hairline px-6 py-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-white/40">
              {isViewerOwner ? 'Defend' : outbid ? 'Outbid' : 'Claim'}
            </p>
            <h2 className="font-display text-2xl text-white">{position.label}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border hairline px-3 py-1.5 text-sm text-white/60 transition hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="border-b hairline bg-gold-500/5 px-6 py-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-white/55">
              {isViewerOwner ? 'Raise to' : outbid ? 'Steal for' : 'Starting bid'}
            </span>
            <span className="font-display text-3xl gold-text">
              {formatMoney(position.nextBidCents, currency)}
            </span>
          </div>
          <p className="mt-1 text-xs text-white/40">
            Charged once. The position is yours until someone pays more.
          </p>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4 px-6 py-6">
          <Field label="Your handle" hint="Shown publicly as @handle">
            <input
              name="handle"
              required
              maxLength={20}
              pattern="[A-Za-z0-9_]{2,20}"
              placeholder="alex"
              autoComplete="nickname"
              className={inputClass}
            />
          </Field>

          <Field label="Email" hint="Receipt and ownership recovery only">
            <input
              name="email"
              type="email"
              required
              maxLength={160}
              placeholder="you@company.com"
              autoComplete="email"
              className={inputClass}
            />
          </Field>

          <Field label="Website" hint={looking ? 'Reading your site…' : 'We fill the rest in'}>
            <input
              name="websiteUrl"
              required
              maxLength={200}
              placeholder="acme.ai"
              inputMode="url"
              autoComplete="url"
              className={inputClass}
              onBlur={(event) => void lookupSite(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void lookupSite(event.currentTarget.value);
                }
              }}
            />
          </Field>

          <Field label="Company / project name">
            <input
              name="companyName"
              required
              maxLength={60}
              placeholder="ACME AI"
              className={inputClass}
            />
          </Field>

          <Field label="Tagline" hint="Up to 90 characters">
            <input
              name="tagline"
              required
              maxLength={90}
              placeholder="AI tools for developers"
              className={inputClass}
            />
          </Field>

          <Field
            label="Logo"
            hint={
              preview?.logoUrl && !logoFileName
                ? 'Found on your site'
                : 'PNG, JPEG, GIF or WebP. Max 256 KB.'
            }
          >
            <div className="flex items-center gap-3">
              {preview?.logoUrl && !logoFileName && (
                <img
                  src={preview.logoUrl}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 shrink-0 rounded-lg border border-white/10 object-cover"
                />
              )}
              <input
                name="logo"
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={(event) =>
                  setLogoFileName(event.currentTarget.files?.[0]?.name ?? null)
                }
                className="w-full text-sm text-white/70 file:mr-3 file:rounded-full file:border-0 file:bg-gold-400/20 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-gold-200 hover:file:bg-gold-400/30"
              />
            </div>
          </Field>

          <Field label="X / Twitter" hint="Optional">
            <input
              name="xUsername"
              maxLength={20}
              placeholder="@acmeai"
              className={inputClass}
            />
          </Field>

          {error && (
            <p role="alert" className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-gradient-to-b from-gold-200 to-gold-500 px-6 py-4 font-display text-lg font-semibold tracking-wide text-black shadow-gold transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? 'Opening checkout...'
              : `${isViewerOwner ? 'Raise your bid' : 'Continue to payment'} - ${formatMoney(
                  position.nextBidCents,
                  currency,
                )}`}
          </button>

          <p className="text-center text-[11px] leading-relaxed text-white/35">
            Ownership transfers only after the payment is confirmed by our payment
            provider. Bids are final and non-refundable once a position is won.
          </p>
        </form>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-[15px] text-white placeholder-white/25 outline-none transition focus:border-gold-400/60 focus:ring-1 focus:ring-gold-400/30';

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-medium text-white/75">{label}</span>
        {hint && <span className="text-[11px] text-white/35">{hint}</span>}
      </span>
      {children}
    </label>
  );
}
