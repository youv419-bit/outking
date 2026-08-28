'use client';

import { useEffect, useState } from 'react';
import { PIECE_GLYPH } from '@/lib/glyphs';
import { formatMoney, timeAgo } from '@/lib/format';
import type { HistoryEntry, PositionView } from '@/lib/types';

type Props = {
  position: PositionView;
  currency: string;
  isViewerOwner: boolean;
  onAct: () => void;
  onClose: () => void;
};

export default function PositionPanel({
  position,
  currency,
  isViewerOwner,
  onAct,
  onClose,
}: Props) {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setHistory([]);
    fetch(`/api/positions/${position.slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { history?: HistoryEntry[] } | null) => {
        if (!cancelled && data?.history) setHistory(data.history);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [position.slug, position.ownershipChanges]);

  const company = position.company;

  return (
    <aside
      className="glass animate-riseIn pointer-events-auto flex max-h-[min(70vh,560px)] w-full flex-col overflow-hidden rounded-2xl sm:w-[300px]"
      aria-label={`${position.label} ownership panel`}
    >
      <header className="flex items-start justify-between gap-3 border-b hairline px-5 py-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="text-3xl leading-none text-gold-300"
            style={{ textShadow: '0 0 24px rgba(212,172,92,0.45)' }}
          >
            {PIECE_GLYPH[position.pieceType]}
          </span>
          <div>
            <h2 className="font-display text-xl uppercase tracking-wide text-white">
              {position.label}
            </h2>
            <p className="text-[11px] uppercase tracking-[0.24em] text-white/35">
              {position.square} · {position.isOwned ? 'Owned' : 'Available'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          className="rounded-full border hairline px-2.5 py-1 text-xs text-white/50 transition hover:text-white"
        >
          ✕
        </button>
      </header>

      <div className="scroll-slim flex-1 overflow-y-auto">
        {company ? (
          <div className="border-b hairline px-5 py-5">
            <div className="flex items-center gap-3">
              {company.logoUrl && (
                <img
                  src={company.logoUrl}
                  alt={`${company.name} logo`}
                  width={48}
                  height={48}
                  className="h-12 w-12 rounded-xl border border-white/10 object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="truncate font-display text-lg text-white">{company.name}</p>
                <p className="truncate text-sm text-white/50">{company.tagline}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <a
                href={company.websiteUrl}
                target="_blank"
                rel="noopener noreferrer nofollow ugc"
                onClick={() => trackClick(position.slug)}
                onAuxClick={() => trackClick(position.slug)}
                className="rounded-full border border-gold-400/40 px-3 py-1 text-xs font-medium text-gold-200 transition hover:bg-gold-400/10"
              >
                {hostOf(company.websiteUrl)} ↗
              </a>
              {company.xUsername && (
                <a
                  href={`https://x.com/${company.xUsername}`}
                  target="_blank"
                  rel="noopener noreferrer nofollow ugc"
                  className="rounded-full border hairline px-3 py-1 text-xs text-white/55 transition hover:text-white"
                >
                  @{company.xUsername}
                </a>
              )}
            </div>
            <p className="mt-3 text-xs text-white/40">
              Held by <span className="text-white/70">@{position.ownerHandle}</span>
              {position.ownedSince && <> · {timeAgo(position.ownedSince)}</>}
              {' · '}
              {position.ownershipChanges} ownership change
              {position.ownershipChanges === 1 ? '' : 's'}
            </p>
            <p className="mt-1 text-xs text-white/40">
              <span className="tabular-nums text-gold-300">{position.clicks}</span>{' '}
              {position.clicks === 1 ? 'click' : 'clicks'} sent to this site from ChessBid
            </p>
          </div>
        ) : (
          <div className="border-b hairline px-5 py-6 text-center">
            <p className="font-display text-2xl tracking-[0.2em] text-white/85">AVAILABLE</p>
            <p className="mt-1 text-sm text-white/45">
              No one has claimed this position yet.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 divide-x divide-white/5 border-b hairline">
          <div className="px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">
              {position.isOwned ? 'Current bid' : 'Starting bid'}
            </p>
            <p className="mt-1 font-display text-2xl text-white">
              {formatMoney(position.currentBidCents ?? position.startingBidCents, currency)}
            </p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">
              {position.isOwned ? 'Steal for' : 'Claim for'}
            </p>
            <p className="mt-1 font-display text-2xl gold-text">
              {formatMoney(position.nextBidCents, currency)}
            </p>
          </div>
        </div>

        {history.length > 0 && (
          <div className="px-5 py-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-white/35">History</p>
            <ol className="mt-3 space-y-2">
              {history.map((entry, index) => (
                <li
                  key={`${entry.acquiredAt}-${index}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="truncate text-white/70">
                    @{entry.handle}
                    <span className="text-white/30"> · {entry.companyName}</span>
                  </span>
                  <span className="shrink-0 tabular-nums text-white/50">
                    {formatMoney(entry.bidCents, currency)}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      <footer className="space-y-2 border-t hairline px-5 py-4">
        {isViewerOwner ? (
          <>
            <p className="rounded-xl border border-gold-400/30 bg-gold-400/5 px-4 py-2.5 text-center text-[11px] text-white/50">
              You own this. Anyone can take it for{' '}
              <span className="tabular-nums text-gold-200">
                {formatMoney(position.nextBidCents, currency)}
              </span>{' '}
              — raise it first and they pay more.
            </p>
            <button
              type="button"
              onClick={onAct}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-gold-400/50 px-5 py-3 font-display text-sm font-semibold uppercase tracking-[0.14em] text-gold-200 transition hover:bg-gold-400/10"
            >
              <span>Raise to</span>
              <span className="tabular-nums">
                {formatMoney(position.nextBidCents, currency)}
              </span>
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onAct}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-gold-200 to-gold-500 px-5 py-3.5 font-display text-base font-semibold uppercase tracking-[0.14em] text-black shadow-gold transition hover:brightness-110"
          >
            <span>{position.isOwned ? 'Outbid' : 'Claim'}</span>
            <span aria-hidden className="text-black/40">·</span>
            <span className="tabular-nums">
              {formatMoney(position.nextBidCents, currency)}
            </span>
          </button>
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              navigator.clipboard
                ?.writeText(`${window.location.origin}/${position.slug}`)
                .then(() => {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1600);
                })
                .catch(() => {});
            }}
            className="flex-1 rounded-xl border hairline px-4 py-2.5 text-sm text-white/55 transition hover:text-white"
          >
            {copied ? 'Link copied' : 'Copy link'}
          </button>
          <a
            href={shareIntent(position, currency)}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl border hairline px-4 py-2.5 text-sm text-white/55 transition hover:text-white"
          >
            Share on X
          </a>
        </div>
      </footer>
    </aside>
  );
}

/** Fire-and-forget: the browser navigates immediately, the count lands after. */
function trackClick(slug: string): void {
  try {
    const body = JSON.stringify({ slug });
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/track/click', new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch('/api/track/click', {
      method: 'POST',
      body,
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
    });
  } catch {
    /* tracking must never break the link */
  }
}

function shareIntent(position: PositionView, currency: string): string {
  const url = typeof window === 'undefined' ? '' : `${window.location.origin}/${position.slug}`;
  const text = position.isOwned
    ? `I own the ${position.label} on ChessBid. Take it from me for ${formatMoney(
        position.nextBidCents,
        currency,
      )}.`
    : `The ${position.label} is unclaimed on ChessBid — ${formatMoney(
        position.nextBidCents,
        currency,
      )}.`;
  return `https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
