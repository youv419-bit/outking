/**
 * Pure bid arithmetic - no imports, no environment, no I/O.
 * Kept dependency-free so it can be unit-tested in isolation.
 */
export function computeNextBid(
  currentBidCents: number | null,
  startingBidCents: number,
  multiplier: number,
  roundingCents: number,
): number {
  if (currentBidCents == null) return startingBidCents;
  const raised = Math.ceil(currentBidCents * multiplier);
  const rounded = Math.ceil(raised / roundingCents) * roundingCents;
  // Always strictly greater than the standing bid, even with silly config.
  return Math.max(rounded, currentBidCents + roundingCents);
}
