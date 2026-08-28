import type { PieceType } from './types';

/** Unicode chess glyphs, used in text UI and OG cards. */
export const PIECE_GLYPH: Record<PieceType, string> = {
  king: '♚',
  queen: '♛',
  rook: '♜',
  bishop: '♝',
  knight: '♞',
  pawn: '♟',
};
