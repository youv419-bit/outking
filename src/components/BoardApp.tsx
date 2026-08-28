'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Activity from './Activity';
import ClaimForm from './ClaimForm';
import PositionPanel from './PositionPanel';
import Stats from './Stats';
import { formatMoney } from '@/lib/format';
import type { ZoomHandle } from './Scene';
import type { BoardState } from '@/lib/types';

const Scene = dynamic(() => import('./Scene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-center">
        <p className="font-display text-3xl gold-text animate-pulseGold">ChessBid</p>
        <p className="mt-2 text-xs uppercase tracking-[0.3em] text-white/30">
          Setting the board
        </p>
      </div>
    </div>
  ),
});

const POLL_MS = 10_000;

type Props = {
  initialState: BoardState;
  initialSlug?: string | null;
};

export default function BoardApp({ initialState, initialSlug = null }: Props) {
  const [state, setState] = useState<BoardState>(initialState);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(initialSlug);
  const [claiming, setClaiming] = useState(false);
  const [won, setWon] = useState<{ label: string; amountCents: number } | null>(null);
  const [outbidAlert, setOutbidAlert] = useState<string | null>(null);
  const dismissedRef = useRef<Set<string>>(new Set());
  const zoomRef = useRef<ZoomHandle | null>(null);

  const positions = state.positions;
  const selected = useMemo(
    () => positions.find((p) => p.slug === selectedSlug) ?? null,
    [positions, selectedSlug],
  );

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/state', { cache: 'no-store' });
      if (!response.ok) return;
      const next = (await response.json()) as BoardState;
      setState(next);
    } catch {
      /* offline: keep the last good board */
    }
  }, []);

  // Live board. Pauses when the tab is hidden so idle tabs cost nothing.
  useEffect(() => {
    let timer: number | undefined;
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
      timer = window.setTimeout(tick, POLL_MS);
    };
    timer = window.setTimeout(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (timer) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // Presence: one ping on load, then a slow heartbeat while the tab is visible.
  useEffect(() => {
    const ping = (view: boolean) => {
      if (document.visibilityState !== 'visible') return;
      void fetch('/api/track/visit', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view }),
      }).catch(() => {});
    };
    ping(true); // this load is a view
    const timer = window.setInterval(() => ping(false), 120_000);
    return () => window.clearInterval(timer);
  }, []);

  // Shareable URL without a full navigation.
  useEffect(() => {
    const path = selectedSlug ? `/${selectedSlug}` : '/';
    if (window.location.pathname !== path) {
      window.history.replaceState(null, '', path);
    }
  }, [selectedSlug]);

  // "You've been outbid" - fires when a position the viewer held is gone.
  useEffect(() => {
    const lost = state.viewer?.lostSlugs ?? [];
    const fresh = lost.find((slug) => !dismissedRef.current.has(slug));
    if (fresh) setOutbidAlert(fresh);
  }, [state.viewer]);

  // Return from checkout: poll the bid until the webhook settles it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const bidId = params.get('paid');
    if (!bidId) return;

    let attempts = 0;
    let cancelled = false;

    const poll = async () => {
      if (cancelled || attempts > 30) return;
      attempts += 1;
      try {
        const response = await fetch(`/api/checkout/status?bid=${encodeURIComponent(bidId)}`, {
          cache: 'no-store',
        });
        if (response.ok) {
          const data = (await response.json()) as {
            status: string;
            slug: string;
            amountCents: number;
          };
          if (data.status === 'paid') {
            const label =
              positions.find((p) => p.slug === data.slug)?.label ?? data.slug;
            setWon({ label, amountCents: data.amountCents });
            setSelectedSlug(data.slug);
            void refresh();
            return;
          }
          if (data.status === 'failed' || data.status === 'refund_required') {
            setWon(null);
            return;
          }
        }
      } catch {
        /* keep trying */
      }
      window.setTimeout(poll, 2000);
    };

    void poll();
    return () => {
      cancelled = true;
    };
    // Runs once on mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const viewerOwns = new Set(state.viewer?.ownedSlugs ?? []);
  const lostPosition = outbidAlert
    ? positions.find((p) => p.slug === outbidAlert) ?? null
    : null;

  return (
    <>
      <div className="relative h-[68vh] min-h-[420px] w-full sm:h-[78vh]">
        <div className="absolute inset-0 vignette">
          <Scene
            positions={positions}
            selectedSlug={selectedSlug}
            currency={state.currency}
            zoomRef={zoomRef}
            onSelect={(slug) => setSelectedSlug(slug)}
          />
        </div>

        {/* Supply counter */}
        <div className="pointer-events-none absolute left-1/2 top-4 w-[min(92vw,420px)] -translate-x-1/2 sm:left-6 sm:translate-x-0">
          <div className="pointer-events-auto">
            <Stats stats={state.stats} />
          </div>
        </div>

        {/* Ownership panel */}
        {selected && (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-center sm:inset-auto sm:right-4 sm:top-4 sm:block">
            <PositionPanel
              position={selected}
              currency={state.currency}
              isViewerOwner={viewerOwns.has(selected.slug)}
              onAct={() => setClaiming(true)}
              onClose={() => setSelectedSlug(null)}
            />
          </div>
        )}

        {/* Zoom lives here rather than on the wheel, so the page always scrolls. */}
        <div className="absolute bottom-4 left-4 flex flex-col gap-2">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoomRef.current?.(0.78)}
            className="glass h-10 w-10 rounded-full text-lg leading-none text-white/70 transition hover:text-white"
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoomRef.current?.(1.28)}
            className="glass h-10 w-10 rounded-full text-lg leading-none text-white/70 transition hover:text-white"
          >
            −
          </button>
        </div>

        {!selected && (
          <p className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 text-center text-[11px] uppercase tracking-[0.24em] text-white/30">
            Tap a piece to claim or outbid · drag to rotate
          </p>
        )}
      </div>

      {/* Live activity + supply, below the board */}
      <section
        id="activity"
        aria-labelledby="activity-heading"
        className="mx-auto w-full max-w-5xl px-5 py-14"
      >
        <h2
          id="activity-heading"
          className="font-display text-sm uppercase tracking-[0.34em] text-white/40"
        >
          Live activity
        </h2>
        <div className="mt-4">
          <Activity
            entries={state.activity}
            currency={state.currency}
            onSelect={(slug) => {
              setSelectedSlug(slug);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        </div>
      </section>

      {claiming && selected && (
        <ClaimForm
          position={selected}
          currency={state.currency}
          isViewerOwner={viewerOwns.has(selected.slug)}
          onClose={() => setClaiming(false)}
        />
      )}

      {won && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-6 backdrop-blur">
          <div className="animate-riseIn max-w-md text-center">
            <p className="text-6xl" aria-hidden>
              👑
            </p>
            <h2 className="mt-4 font-display text-4xl uppercase tracking-wide gold-text">
              You own the {won.label}
            </h2>
            <p className="mt-3 text-white/60">
              Paid {formatMoney(won.amountCents, state.currency)}. Your brand is on the
              board. Now defend it.
            </p>
            <button
              type="button"
              onClick={() => {
                setWon(null);
                window.history.replaceState(null, '', `/${selectedSlug ?? ''}`);
              }}
              className="mt-7 rounded-xl bg-gradient-to-b from-gold-200 to-gold-500 px-8 py-3.5 font-display text-lg font-semibold uppercase tracking-[0.14em] text-black shadow-gold"
            >
              See the board
            </button>
          </div>
        </div>
      )}

      {lostPosition && (
        <div className="fixed inset-x-0 bottom-0 z-[55] p-4">
          <div className="glass animate-riseIn mx-auto flex max-w-2xl flex-col items-center gap-3 rounded-2xl px-6 py-5 text-center sm:flex-row sm:text-left">
            <div className="flex-1">
              <p className="font-display text-xl uppercase tracking-wide text-white">
                You&apos;ve been outbid.
              </p>
              <p className="text-sm text-white/55">
                Someone just stole your {lostPosition.label}.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setSelectedSlug(lostPosition.slug);
                  setClaiming(true);
                  dismissedRef.current.add(lostPosition.slug);
                  setOutbidAlert(null);
                }}
                className="rounded-xl bg-gradient-to-b from-gold-200 to-gold-500 px-5 py-3 font-display text-sm font-semibold uppercase tracking-[0.14em] text-black"
              >
                Take it back
              </button>
              <button
                type="button"
                onClick={() => {
                  dismissedRef.current.add(lostPosition.slug);
                  setOutbidAlert(null);
                }}
                className="rounded-xl border hairline px-4 py-3 text-sm text-white/50"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
