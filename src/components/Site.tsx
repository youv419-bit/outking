import Link from 'next/link';
import BoardApp from './BoardApp';
import ExampleBoard from './ExampleBoard';
import { PIECE_GLYPH } from '@/lib/glyphs';
import { formatMoney } from '@/lib/format';
import type { BoardState } from '@/lib/types';

/**
 * The whole site. Server-rendered shell (hero, position index, how it works,
 * footer) wrapped around one client island: the 3D board.
 */
export default function Site({
  state,
  initialSlug = null,
}: {
  state: BoardState;
  initialSlug?: string | null;
}) {
  return (
    <main className="relative">
      <Hero stats={state.stats} />

      <div id="board" className="scroll-mt-4">
        <BoardApp initialState={state} initialSlug={initialSlug} />
      </div>

      <PositionIndex state={state} />
      <ExampleBoard currency={state.currency} />
      <HowItWorks />
      <FinalCta />
      <Footer />
    </main>
  );
}

function Hero({ stats }: { stats: BoardState['stats'] }) {
  // Never advertise an empty board. Scarcity reads well; emptiness does not.
  const subline =
    stats.claimed === 0
      ? `${stats.total} positions · one owner each`
      : `${stats.available} of ${stats.total} still available`;
  return (
    <header className="relative mx-auto w-full max-w-5xl px-5 pb-8 pt-14 text-center sm:pt-20">
      <p className="text-[11px] uppercase tracking-[0.4em] text-gold-300/70">
        ChessBid
      </p>
      <h1 className="mt-4 font-display text-[clamp(2.75rem,10vw,6rem)] font-semibold uppercase leading-[0.92] tracking-tight gold-text">
        Become the King.
      </h1>
      <p className="mx-auto mt-5 max-w-xl text-base text-white/60 sm:text-lg">
        Own a chess position. Defend it from anyone willing to pay more.
      </p>
      <div className="mt-8 flex flex-col items-center gap-3">
        <a
          href="#board"
          className="rounded-xl bg-gradient-to-b from-gold-200 to-gold-500 px-9 py-4 font-display text-lg font-semibold uppercase tracking-[0.16em] text-black shadow-gold transition hover:brightness-110"
        >
          Enter the board
        </a>
        <p className="text-[11px] uppercase tracking-[0.28em] text-white/30">
          {subline}
        </p>
      </div>
    </header>
  );
}

function PositionIndex({ state }: { state: BoardState }) {
  return (
    <section
      aria-labelledby="positions-heading"
      className="mx-auto w-full max-w-5xl px-5 pb-16"
    >
      <h2
        id="positions-heading"
        className="font-display text-sm uppercase tracking-[0.34em] text-white/40"
      >
        Every position
      </h2>
      <ul className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {state.positions.map((position) => (
          <li key={position.slug}>
            <Link
              href={`/${position.slug}`}
              className="flex items-center gap-3 rounded-xl border hairline bg-black/40 px-4 py-3 transition hover:border-gold-400/40 hover:bg-black/60"
            >
              <span aria-hidden className="text-xl text-gold-300/80">
                {PIECE_GLYPH[position.pieceType]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white/85">
                  {position.label}
                </span>
                <span className="block truncate text-xs text-white/40">
                  {position.company
                    ? `${position.company.name} · @${position.ownerHandle}`
                    : 'Available'}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-[10px] uppercase tracking-[0.18em] text-white/30">
                  {position.isOwned ? 'Steal for' : 'Claim for'}
                </span>
                <span className="block font-display text-base text-gold-200">
                  {formatMoney(position.nextBidCents, state.currency)}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    ['Choose a position', 'Sixteen pieces. One owner each.'],
    ['Bid', 'The price is set by the board, not by you.'],
    ['Pay', 'Secure checkout. Ownership only after confirmation.'],
    ['Own it', 'Your logo, name and link sit on the piece.'],
    ['Get outbid', 'Anyone can pay more. Then you take it back.'],
  ];
  return (
    <section
      aria-labelledby="how-heading"
      className="mx-auto w-full max-w-5xl px-5 pb-20"
    >
      <h2
        id="how-heading"
        className="font-display text-sm uppercase tracking-[0.34em] text-white/40"
      >
        How it works
      </h2>
      <ol className="mt-5 grid gap-3 sm:grid-cols-5">
        {steps.map(([title, body], index) => (
          <li
            key={title}
            className="rounded-2xl border hairline bg-black/40 px-4 py-5"
          >
            <span className="font-display text-3xl text-gold-500/50">{index + 1}</span>
            <p className="mt-2 text-sm font-medium text-white/85">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-white/40">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="mx-auto w-full max-w-5xl px-5 pb-24 text-center">
      <h2 className="font-display text-[clamp(2rem,7vw,4rem)] font-semibold uppercase leading-tight tracking-tight gold-text">
        Which piece will you own?
      </h2>
      <a
        href="#board"
        className="mt-7 inline-block rounded-xl border border-gold-400/50 px-8 py-3.5 font-display text-base uppercase tracking-[0.16em] text-gold-200 transition hover:bg-gold-400/10"
      >
        Back to the board
      </a>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t hairline px-5 py-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
        <p className="font-display text-sm uppercase tracking-[0.3em] text-white/40">
          ChessBid
        </p>
        <p className="text-xs text-white/25">
          Own the piece. Defend it. Outbid anyone who wants it.
        </p>
      </div>
    </footer>
  );
}
