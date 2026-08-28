'use client';

import type { BoardState } from '@/lib/types';

/**
 * Numbers are only shown once they help.
 *
 * This product runs on social proof: "15 available" is only compelling if
 * people believe someone wants the other one. An empty board advertising
 * "0 CLAIMED" next to a handful of visitors argues against buying. So on a
 * cold board the counters are replaced with scarcity framing, and the audience
 * row stays hidden until it is worth showing.
 */
const AUDIENCE_THRESHOLD = 200;

export default function Stats({ stats }: { stats: BoardState['stats'] }) {
  const cold = stats.claimed === 0;

  // `views` only exists once the views migration is applied; fall back to
  // unique visitors so this component works either way.
  const audience = stats.views ?? stats.visitors;
  const audienceLabel = stats.views == null ? 'visitors' : 'views';
  const showAudience = audience >= AUDIENCE_THRESHOLD;

  return (
    <div className="overflow-hidden rounded-2xl border hairline bg-black/50">
      {cold ? (
        <div className="grid grid-cols-2 divide-x divide-white/5">
          <div className="px-4 py-3 text-center">
            <p className="font-display text-2xl leading-none text-white">{stats.total}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-white/35">
              Positions
            </p>
          </div>
          <div className="flex flex-col justify-center px-4 py-3 text-center">
            <p className="font-display text-sm uppercase leading-none tracking-[0.16em] text-gold-200">
              Limited supply
            </p>
            <p className="mt-1.5 text-[10px] uppercase tracking-[0.22em] text-white/35">
              One owner each
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 divide-x divide-white/5">
          {[
            { value: stats.total, label: 'Positions' },
            { value: stats.claimed, label: 'Claimed' },
            { value: stats.available, label: 'Available' },
          ].map((item) => (
            <div key={item.label} className="px-4 py-3 text-center">
              <p className="font-display text-2xl leading-none text-white">{item.value}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-white/35">
                {item.label}
              </p>
            </div>
          ))}
        </div>
      )}

      {showAudience && (
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-t hairline px-4 py-1.5 text-[10px] uppercase tracking-[0.16em] text-white/35">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulseGold"
          />
          <span className="tabular-nums text-white/60">{stats.online}</span>
          <span>online</span>
          <span aria-hidden className="text-white/20">·</span>
          <span className="tabular-nums text-white/60">{audience.toLocaleString()}</span>
          <span>{audienceLabel}</span>
        </div>
      )}
    </div>
  );
}
