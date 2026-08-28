import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="text-5xl" aria-hidden>
        ♚
      </p>
      <h1 className="mt-5 font-display text-4xl uppercase tracking-wide gold-text">
        Off the board
      </h1>
      <p className="mt-3 max-w-sm text-white/50">
        That position does not exist. There are only sixteen, and they are all on the
        board.
      </p>
      <Link
        href="/"
        className="mt-8 rounded-xl bg-gradient-to-b from-gold-200 to-gold-500 px-7 py-3.5 font-display text-base font-semibold uppercase tracking-[0.16em] text-black shadow-gold"
      >
        Enter the board
      </Link>
    </main>
  );
}
