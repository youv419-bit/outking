import { PIECE_GLYPH } from '@/lib/glyphs';
import { formatMoney } from '@/lib/format';
import type { PieceType } from '@/lib/types';

/**
 * A worked example of a board that has been fought over.
 *
 * New visitors land on a mostly-empty board and cannot picture the end state,
 * which is the whole pitch: sixteen brands, each defending a price. This shows
 * it. Everything here is invented and labelled as such - it is an illustration
 * of the product, never a claim about who owns what.
 */

type Example = {
  piece: PieceType;
  label: string;
  brand: string;
  mark: string;
  hue: number;
  bidCents: number;
  changes: number;
};

const EXAMPLE: Example[] = [
  { piece: 'king',   label: 'King',           brand: 'Nimbus AI',  mark: 'N', hue: 205, bidCents: 5400, changes: 9 },
  { piece: 'queen',  label: 'Queen',          brand: 'Forgeline',  mark: 'F', hue: 340, bidCents: 3100, changes: 7 },
  { piece: 'rook',   label: "Queen's Rook",   brand: 'Cobalt',     mark: 'C', hue: 225, bidCents: 1800, changes: 5 },
  { piece: 'rook',   label: "King's Rook",    brand: 'Northstar',  mark: 'N', hue: 45,  bidCents: 1500, changes: 4 },
  { piece: 'bishop', label: "Queen's Bishop", brand: 'Verity',     mark: 'V', hue: 155, bidCents: 1100, changes: 4 },
  { piece: 'bishop', label: "King's Bishop",  brand: 'Prismic',    mark: 'P', hue: 280, bidCents: 900,  changes: 3 },
  { piece: 'knight', label: "Queen's Knight", brand: 'Fathom',     mark: 'F', hue: 190, bidCents: 1200, changes: 5 },
  { piece: 'knight', label: "King's Knight",  brand: 'Ember',      mark: 'E', hue: 20,  bidCents: 800,  changes: 3 },
  { piece: 'pawn',   label: 'A-Pawn',         brand: 'Quill',      mark: 'Q', hue: 260, bidCents: 700,  changes: 4 },
  { piece: 'pawn',   label: 'B-Pawn',         brand: 'Kettle',     mark: 'K', hue: 15,  bidCents: 600,  changes: 3 },
  { piece: 'pawn',   label: 'C-Pawn',         brand: 'Ripple',     mark: 'R', hue: 195, bidCents: 500,  changes: 3 },
  { piece: 'pawn',   label: 'D-Pawn',         brand: 'Atlas Labs', mark: 'A', hue: 95,  bidCents: 500,  changes: 2 },
  { piece: 'pawn',   label: 'E-Pawn',         brand: 'Beacon',     mark: 'B', hue: 50,  bidCents: 400,  changes: 2 },
  { piece: 'pawn',   label: 'F-Pawn',         brand: 'Onyx',       mark: 'O', hue: 240, bidCents: 400,  changes: 2 },
  { piece: 'pawn',   label: 'G-Pawn',         brand: 'Pixelform',  mark: 'P', hue: 320, bidCents: 300,  changes: 1 },
  { piece: 'pawn',   label: 'H-Pawn',         brand: 'Loopwork',   mark: 'L', hue: 170, bidCents: 300,  changes: 1 },
];

const TOTAL = EXAMPLE.reduce((sum, item) => sum + item.bidCents, 0);
const CHANGES = EXAMPLE.reduce((sum, item) => sum + item.changes, 0);

export default function ExampleBoard({ currency }: { currency: string }) {
  return (
    <section
      aria-labelledby="example-heading"
      className="defer-paint mx-auto w-full max-w-5xl px-5 pb-20"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="example-heading"
          className="font-display text-sm uppercase tracking-[0.34em] text-white/40"
        >
          What a full board looks like
        </h2>
        <span className="rounded-full border border-white/10 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.22em] text-white/35">
          Example
        </span>
      </div>

      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/45">
        Sixteen brands, each holding a piece at the price they paid to take it.
        Every one of these can be stolen by paying more.{' '}
        <span className="text-white/30">
          The companies below are invented for illustration.
        </span>
      </p>

      {/* The board itself, as it looks once every piece is held. */}
      <figure className="mt-6 overflow-hidden rounded-2xl border hairline bg-black/40">
        <img
          src="/example-board.png"
          alt="Example of the ChessBid board with all sixteen positions claimed, each piece carrying an owner's logo, name and current price."
          width={2048}
          height={885}
          loading="lazy"
          decoding="async"
          className="block w-full"
        />
        <figcaption className="border-t hairline px-5 py-2.5 text-center text-[11px] uppercase tracking-[0.18em] text-white/30">
          Your logo, name and link sit on the piece you own
        </figcaption>
      </figure>

      <div className="mt-4 overflow-hidden rounded-2xl border hairline bg-black/40">
        <ul className="grid grid-cols-2 gap-px bg-white/5 sm:grid-cols-4">
          {EXAMPLE.map((item, index) => (
            <li key={index} className="bg-ink-950/90 p-3.5">
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold text-black"
                  style={{
                    background: `linear-gradient(145deg, hsl(${item.hue} 70% 68%), hsl(${item.hue} 65% 46%))`,
                  }}
                >
                  {item.mark}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-white/85">
                    {item.brand}
                  </span>
                  <span className="block truncate text-[10px] uppercase tracking-[0.14em] text-white/30">
                    <span aria-hidden className="text-gold-300/60">
                      {PIECE_GLYPH[item.piece]}
                    </span>{' '}
                    {item.label}
                  </span>
                </span>
              </div>
              <div className="mt-3 flex items-baseline justify-between border-t hairline pt-2.5">
                <span className="font-display text-base text-gold-200 tabular-nums">
                  {formatMoney(item.bidCents, currency)}
                </span>
                <span className="text-[10px] uppercase tracking-[0.14em] text-white/25">
                  {item.changes}&times; stolen
                </span>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 border-t hairline px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-white/35">
          <span>
            <span className="tabular-nums text-white/70">16</span> owners
          </span>
          <span>
            <span className="tabular-nums text-white/70">{CHANGES}</span> ownership changes
          </span>
          <span>
            <span className="tabular-nums text-gold-200">{formatMoney(TOTAL, currency)}</span>{' '}
            standing on the board
          </span>
        </div>
      </div>
    </section>
  );
}
