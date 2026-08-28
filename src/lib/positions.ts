import 'server-only';
import boardData from './board.json';
import { query, queryOne } from './db';
import { currency } from './config';
import { nextBidCents } from './money';
import { clicksByPosition, getSiteStats } from './stats';
import type {
  ActivityEntry,
  BoardSlot,
  BoardState,
  HistoryEntry,
  PieceType,
  PositionView,
} from './types';

export const BOARD: BoardSlot[] = (boardData.positions as BoardSlot[]).slice();

export const BOARD_BY_SLUG = new Map(BOARD.map((slot) => [slot.slug, slot]));

export const PIECE_ORDER: PieceType[] = [
  'king',
  'queen',
  'rook',
  'bishop',
  'knight',
  'pawn',
];

type PositionRow = {
  slug: string;
  piece_type: PieceType;
  label: string;
  square: string;
  starting_bid_cents: number;
  current_bid_cents: number | null;
  ownership_changes: number;
  owned_since: Date | null;
  owner_handle: string | null;
  company_id: string | null;
  company_name: string | null;
  company_tagline: string | null;
  company_website: string | null;
  company_x: string | null;
  has_logo: boolean | null;
};

const POSITION_SELECT = `
  SELECT p.slug,
         p.piece_type,
         p.label,
         p.square,
         p.starting_bid_cents,
         p.current_bid_cents,
         p.ownership_changes,
         p.owned_since,
         u.handle              AS owner_handle,
         c.id                  AS company_id,
         c.name                AS company_name,
         c.tagline             AS company_tagline,
         c.website_url         AS company_website,
         c.x_username          AS company_x,
         (c.logo_data IS NOT NULL) AS has_logo
    FROM positions p
    LEFT JOIN users u     ON u.id = p.owner_user_id
    LEFT JOIN companies c ON c.id = p.owner_company_id
`;

function toView(row: PositionRow, clicks = 0): PositionView {
  const slot = BOARD_BY_SLUG.get(row.slug);
  return {
    slug: row.slug,
    pieceType: row.piece_type,
    label: row.label,
    square: row.square,
    file: slot?.file ?? 0,
    rank: slot?.rank ?? 1,
    startingBidCents: row.starting_bid_cents,
    currentBidCents: row.current_bid_cents,
    nextBidCents: nextBidCents(row.current_bid_cents, row.starting_bid_cents),
    ownershipChanges: row.ownership_changes,
    ownedSince: row.owned_since ? row.owned_since.toISOString() : null,
    ownerHandle: row.owner_handle,
    company: row.company_id
      ? {
          id: row.company_id,
          name: row.company_name ?? '',
          tagline: row.company_tagline ?? '',
          websiteUrl: row.company_website ?? '',
          xUsername: row.company_x,
          logoUrl: row.has_logo ? `/api/logo/${row.company_id}` : null,
        }
      : null,
    isOwned: Boolean(row.owner_handle),
    clicks,
  };
}

export async function listPositions(): Promise<PositionView[]> {
  const [rows, clicks] = await Promise.all([
    query<PositionRow>(`${POSITION_SELECT} ORDER BY p.sort_order`),
    clicksByPosition(),
  ]);
  return rows.map((row) => toView(row, clicks.get(row.slug) ?? 0));
}

export async function getPosition(slug: string): Promise<PositionView | null> {
  if (!BOARD_BY_SLUG.has(slug)) return null;
  const [row, clicks] = await Promise.all([
    queryOne<PositionRow>(`${POSITION_SELECT} WHERE p.slug = $1`, [slug]),
    clicksByPosition(),
  ]);
  return row ? toView(row, clicks.get(row.slug) ?? 0) : null;
}

type HistoryRow = {
  handle: string;
  company_name: string;
  bid_cents: number;
  acquired_at: Date;
};

export async function getHistory(slug: string, limit = 12): Promise<HistoryEntry[]> {
  const rows = await query<HistoryRow>(
    `SELECT u.handle, c.name AS company_name, o.bid_cents, o.acquired_at
       FROM ownership o
       JOIN users u     ON u.id = o.user_id
       JOIN companies c ON c.id = o.company_id
      WHERE o.position_slug = $1
      ORDER BY o.acquired_at DESC
      LIMIT $2`,
    [slug, limit],
  );
  return rows.map((r) => ({
    handle: r.handle,
    companyName: r.company_name,
    bidCents: r.bid_cents,
    acquiredAt: r.acquired_at.toISOString(),
  }));
}

type ActivityRow = {
  handle: string;
  company_name: string;
  bid_cents: number;
  acquired_at: Date;
  position_slug: string;
  label: string;
  piece_type: PieceType;
  seq: string;
  had_before: boolean;
};

export async function getActivity(limit = 12): Promise<ActivityEntry[]> {
  const rows = await query<ActivityRow>(
    `WITH ranked AS (
       SELECT o.*,
              row_number() OVER (PARTITION BY o.position_slug ORDER BY o.acquired_at) AS seq,
              EXISTS (
                SELECT 1 FROM ownership prev
                 WHERE prev.position_slug = o.position_slug
                   AND prev.user_id = o.user_id
                   AND prev.acquired_at < o.acquired_at
              ) AS had_before
         FROM ownership o
     )
     SELECT r.position_slug, p.label, p.piece_type, u.handle,
            c.name AS company_name, r.bid_cents, r.acquired_at, r.seq, r.had_before
       FROM ranked r
       JOIN positions p ON p.slug = r.position_slug
       JOIN users u     ON u.id = r.user_id
       JOIN companies c ON c.id = r.company_id
      ORDER BY r.acquired_at DESC
      LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    slug: r.position_slug,
    label: r.label,
    pieceType: r.piece_type,
    handle: r.handle,
    companyName: r.company_name,
    bidCents: r.bid_cents,
    acquiredAt: r.acquired_at.toISOString(),
    kind: Number(r.seq) === 1 ? 'claimed' : r.had_before ? 'reclaimed' : 'stole',
  }));
}

export async function getBoardState(userId?: string | null): Promise<BoardState> {
  const [positions, activity, site] = await Promise.all([
    listPositions(),
    getActivity(),
    getSiteStats(),
  ]);
  const claimed = positions.filter((p) => p.isOwned).length;

  let viewer: BoardState['viewer'] = null;
  if (userId) {
    const rows = await query<{ handle: string; owned: string[]; lost: string[] }>(
      `SELECT u.handle,
              ARRAY(
                SELECT p.slug FROM positions p
                 WHERE p.owner_user_id = u.id ORDER BY p.sort_order
              ) AS owned,
              ARRAY(
                SELECT DISTINCT o.position_slug
                  FROM ownership o
                  JOIN positions p2 ON p2.slug = o.position_slug
                 WHERE o.user_id = u.id
                   AND (p2.owner_user_id IS NULL OR p2.owner_user_id <> u.id)
              ) AS lost
         FROM users u WHERE u.id = $1`,
      [userId],
    );
    if (rows[0]) {
      viewer = {
        handle: rows[0].handle,
        ownedSlugs: rows[0].owned ?? [],
        lostSlugs: rows[0].lost ?? [],
      };
    }
  }

  return {
    positions,
    stats: {
      total: positions.length,
      claimed,
      available: positions.length - claimed,
      online: site.online,
      visitors: site.visitors,
      views: site.views,
    },
    activity,
    viewer,
    currency,
  };
}
