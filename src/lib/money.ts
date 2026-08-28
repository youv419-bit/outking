import { bidMultiplier, bidRoundingCents } from './config';
import { computeNextBid } from './bidmath';

/**
 * The single source of truth for what a position costs next.
 * Runs on the server only - a browser-supplied amount is never trusted.
 */
export function nextBidCents(
  currentBidCents: number | null,
  startingBidCents: number,
): number {
  return computeNextBid(
    currentBidCents,
    startingBidCents,
    bidMultiplier,
    bidRoundingCents,
  );
}

export { formatMoney as formatCents } from './format';
