'use client';

import { formatMoney, timeAgo } from '@/lib/format';
import type { ActivityEntry } from '@/lib/types';

const ICON: Record<ActivityEntry['kind'], string> = {
  claimed: '👑',
  stole: '🔥',
  reclaimed: '⚔️',
};

const VERB: Record<ActivityEntry['kind'], string> = {
  claimed: 'claimed',
  stole: 'stole',
  reclaimed: 'reclaimed',
};

export default function Activity({
  entries,
  currency,
  onSelect,
}: {
  entries: ActivityEntry[];
  currency: string;
  onSelect?: (slug: string) => void;
}) {
  if (entries.length === 0) {
    return (
      <p className="rounded-2xl border hairline bg-black/40 px-5 py-6 text-center text-sm text-white/40">
        No moves yet. The board is wide open.
      </p>
    );
  }

  return (
    <ul className="scroll-slim max-h-[280px] space-y-1 overflow-y-auto rounded-2xl border hairline bg-black/40 p-2">
      {entries.map((entry, index) => (
        <li key={`${entry.slug}-${entry.acquiredAt}-${index}`}>
          <button
            type="button"
            onClick={() => onSelect?.(entry.slug)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-white/5"
          >
            <span aria-hidden className="text-base">
              {ICON[entry.kind]}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-white/75">
              <span className="text-white">@{entry.handle}</span> {VERB[entry.kind]} the{' '}
              <span className="text-gold-200">{entry.label}</span> for{' '}
              <span className="tabular-nums">{formatMoney(entry.bidCents, currency)}</span>
            </span>
            <span className="shrink-0 text-[11px] text-white/30">
              {timeAgo(entry.acquiredAt)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
