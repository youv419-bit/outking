import * as THREE from 'three';
import type { PieceType } from '@/lib/types';

/**
 * Chess pieces are generated procedurally as lathed profiles rather than
 * loaded from GLB files. Three reasons: nothing to download (the whole board
 * costs zero network requests), it stays crisp at any zoom, and the six
 * geometries together are a few thousand triangles instead of a few megabytes.
 */

type Profile = Array<[number, number]>;

const PROFILES: Record<PieceType, Profile> = {
  pawn: [
    [0.0, 0.0], [0.30, 0.0], [0.30, 0.05], [0.27, 0.08], [0.19, 0.13],
    [0.13, 0.22], [0.12, 0.34], [0.17, 0.42], [0.10, 0.46], [0.22, 0.50],
    [0.22, 0.55], [0.11, 0.58], [0.18, 0.64], [0.19, 0.71], [0.13, 0.79],
    [0.0, 0.84],
  ],
  rook: [
    [0.0, 0.0], [0.36, 0.0], [0.36, 0.06], [0.32, 0.11], [0.25, 0.18],
    [0.23, 0.45], [0.26, 0.60], [0.24, 0.66], [0.33, 0.72], [0.34, 0.86],
    [0.27, 0.86], [0.27, 0.80], [0.0, 0.80],
  ],
  knight: [
    [0.0, 0.0], [0.35, 0.0], [0.35, 0.06], [0.31, 0.11], [0.24, 0.18],
    [0.22, 0.30], [0.24, 0.36], [0.20, 0.40], [0.0, 0.40],
  ],
  bishop: [
    [0.0, 0.0], [0.35, 0.0], [0.35, 0.06], [0.31, 0.10], [0.22, 0.17],
    [0.15, 0.30], [0.14, 0.48], [0.24, 0.54], [0.24, 0.60], [0.13, 0.64],
    [0.20, 0.74], [0.21, 0.88], [0.14, 1.00], [0.07, 1.06], [0.09, 1.10],
    [0.0, 1.16],
  ],
  queen: [
    [0.0, 0.0], [0.40, 0.0], [0.40, 0.07], [0.35, 0.12], [0.25, 0.20],
    [0.17, 0.38], [0.16, 0.62], [0.27, 0.68], [0.27, 0.75], [0.15, 0.79],
    [0.24, 0.92], [0.33, 1.10], [0.30, 1.18], [0.18, 1.20], [0.15, 1.26],
    [0.11, 1.31], [0.0, 1.36],
  ],
  king: [
    [0.0, 0.0], [0.42, 0.0], [0.42, 0.07], [0.37, 0.12], [0.27, 0.21],
    [0.18, 0.42], [0.17, 0.70], [0.29, 0.76], [0.29, 0.84], [0.16, 0.88],
    [0.25, 1.02], [0.33, 1.22], [0.29, 1.30], [0.20, 1.32], [0.20, 1.38],
    [0.0, 1.40],
  ],
};

const cache = new Map<string, THREE.BufferGeometry>();

function lathe(type: PieceType, segments: number): THREE.BufferGeometry {
  const points = PROFILES[type].map(([x, y]) => new THREE.Vector2(Math.max(x, 0.0001), y));
  const geometry = new THREE.LatheGeometry(points, segments);
  geometry.computeVertexNormals();
  return geometry;
}

/** A stylised horse head, extruded and tilted, for the knight. */
function knightHead(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-0.18, 0.0);
  shape.lineTo(0.16, 0.0);
  shape.quadraticCurveTo(0.22, 0.16, 0.12, 0.3);
  shape.quadraticCurveTo(0.34, 0.36, 0.36, 0.5);
  shape.lineTo(0.24, 0.62);
  shape.quadraticCurveTo(0.1, 0.72, -0.02, 0.68);
  shape.lineTo(-0.06, 0.78);
  shape.lineTo(-0.16, 0.66);
  shape.quadraticCurveTo(-0.3, 0.56, -0.26, 0.34);
  shape.quadraticCurveTo(-0.24, 0.16, -0.18, 0.0);

  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 0.26,
    bevelEnabled: true,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    bevelSegments: 3,
    curveSegments: 12,
  });
  geometry.translate(0, 0, -0.13);
  geometry.computeVertexNormals();
  return geometry;
}

export function bodyGeometry(type: PieceType, quality: 'high' | 'low' = 'high') {
  const segments = quality === 'high' ? 48 : 20;
  const key = `${type}-${segments}`;
  let geometry = cache.get(key);
  if (!geometry) {
    geometry = lathe(type, segments);
    cache.set(key, geometry);
  }
  return geometry;
}

export function knightHeadGeometry() {
  let geometry = cache.get('knight-head');
  if (!geometry) {
    geometry = knightHead();
    cache.set('knight-head', geometry);
  }
  return geometry;
}

/** Approximate height of each piece, used to place labels and hit boxes. */
export const PIECE_HEIGHT: Record<PieceType, number> = {
  pawn: 0.84,
  rook: 0.9,
  knight: 1.05,
  bishop: 1.16,
  queen: 1.36,
  king: 1.55,
};

export function disposeGeometryCache() {
  cache.forEach((geometry) => geometry.dispose());
  cache.clear();
}
