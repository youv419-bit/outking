export type PieceType = 'king' | 'queen' | 'rook' | 'bishop' | 'knight' | 'pawn';

export type BoardSlot = {
  slug: string;
  pieceType: PieceType;
  label: string;
  square: string;
  file: number;
  rank: number;
  startingBidCents: number;
  sortOrder: number;
};

export type OwnerCompany = {
  id: string;
  name: string;
  tagline: string;
  websiteUrl: string;
  xUsername: string | null;
  logoUrl: string | null;
};

export type PositionView = {
  slug: string;
  pieceType: PieceType;
  label: string;
  square: string;
  file: number;
  rank: number;
  startingBidCents: number;
  currentBidCents: number | null;
  nextBidCents: number;
  ownershipChanges: number;
  ownedSince: string | null;
  ownerHandle: string | null;
  company: OwnerCompany | null;
  isOwned: boolean;
  /** Outbound clicks the current owner has received from ChessBid. */
  clicks: number;
};

export type HistoryEntry = {
  handle: string;
  companyName: string;
  bidCents: number;
  acquiredAt: string;
};

export type ActivityEntry = {
  slug: string;
  label: string;
  pieceType: PieceType;
  handle: string;
  companyName: string;
  bidCents: number;
  acquiredAt: string;
  kind: 'claimed' | 'stole' | 'reclaimed';
};

export type BoardState = {
  positions: PositionView[];
  stats: {
    total: number;
    claimed: number;
    available: number;
    online: number;
    visitors: number;
    /** Optional: present once migration 003 and the views patch are applied. */
    views?: number;
  };
  activity: ActivityEntry[];
  viewer: { handle: string; ownedSlugs: string[]; lostSlugs: string[] } | null;
  currency: string;
};
