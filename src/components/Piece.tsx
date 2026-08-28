'use client';

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { PositionView } from '@/lib/types';
import { formatMoney } from '@/lib/format';
import { PIECE_HEIGHT, bodyGeometry, knightHeadGeometry } from './pieceGeometry';

type Props = {
  position: PositionView;
  x: number;
  z: number;
  selected: boolean;
  dimmed: boolean;
  quality: 'high' | 'low';
  labelMode: 'full' | 'compact';
  currency: string;
  onSelect: (slug: string) => void;
};

/** Owned pieces are gold; the King a brighter gold. Free pieces are pewter -
 *  light enough to read against a near-black board, cool enough to stay
 *  visually subordinate to the gold. */
const OWNED_COLOR = '#d9b062';
const OWNED_KING_COLOR = '#f2d492';
const FREE_COLOR = '#9aa0b4';

export default function Piece({
  position,
  x,
  z,
  selected,
  dimmed,
  quality,
  labelMode,
  currency,
  onSelect,
}: Props) {
  const group = useRef<THREE.Group>(null);
  const hovered = useRef(false);
  const owned = position.isOwned;
  const isKing = position.pieceType === 'king';

  const material = useMemo(() => {
    const color = owned ? (isKing ? OWNED_KING_COLOR : OWNED_COLOR) : FREE_COLOR;
    return new THREE.MeshPhysicalMaterial({
      color,
      metalness: owned ? 0.95 : 0.75,
      roughness: owned ? 0.22 : 0.34,
      clearcoat: owned ? 0.6 : 0.35,
      clearcoatRoughness: 0.3,
      emissive: new THREE.Color(owned ? '#3a2708' : '#0e1018'),
      emissiveIntensity: owned ? 0.4 : 0.25,
    });
  }, [owned, isKing]);

  const geometry = bodyGeometry(position.pieceType, quality);

  useFrame((_, delta) => {
    const node = group.current;
    if (!node) return;
    const lift = selected ? 0.22 : hovered.current ? 0.09 : 0;
    node.position.y += (lift - node.position.y) * Math.min(1, delta * 9);
    const targetScale = selected ? 1.06 : 1;
    const s = node.scale.x + (targetScale - node.scale.x) * Math.min(1, delta * 9);
    node.scale.setScalar(s);
    if (selected) {
      node.rotation.y += delta * 0.35;
    } else {
      node.rotation.y += (0 - node.rotation.y) * Math.min(1, delta * 4);
    }
    const opacity = dimmed ? 0.62 : 1;
    if (Math.abs(material.opacity - opacity) > 0.005) {
      material.transparent = true;
      material.opacity += (opacity - material.opacity) * Math.min(1, delta * 8);
    }
  });

  const height = PIECE_HEIGHT[position.pieceType];
  const price = formatMoney(position.nextBidCents, currency);

  return (
    <group position={[x, 0, z]}>
      <group ref={group}>
        <mesh
          geometry={geometry}
          material={material}
          castShadow
          receiveShadow
          onPointerOver={(event) => {
            event.stopPropagation();
            hovered.current = true;
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={() => {
            hovered.current = false;
            document.body.style.cursor = 'auto';
          }}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(position.slug);
          }}
        />

        {position.pieceType === 'knight' && (
          <mesh
            geometry={knightHeadGeometry()}
            material={material}
            position={[0.02, 0.38, 0]}
            rotation={[0, Math.PI / 2, -0.12]}
            castShadow
          />
        )}

        {position.pieceType === 'rook' &&
          Array.from({ length: 6 }).map((_, index) => {
            const angle = (index / 6) * Math.PI * 2;
            return (
              <mesh
                key={index}
                material={material}
                castShadow
                position={[Math.cos(angle) * 0.29, 0.88, Math.sin(angle) * 0.29]}
                rotation={[0, -angle, 0]}
              >
                <boxGeometry args={[0.1, 0.1, 0.11]} />
              </mesh>
            );
          })}

        {position.pieceType === 'queen' &&
          Array.from({ length: 7 }).map((_, index) => {
            const angle = (index / 7) * Math.PI * 2;
            return (
              <mesh
                key={index}
                material={material}
                castShadow
                position={[Math.cos(angle) * 0.2, 1.34, Math.sin(angle) * 0.2]}
              >
                <sphereGeometry args={[0.045, 10, 10]} />
              </mesh>
            );
          })}

        {isKing && (
          <group position={[0, 1.44, 0]}>
            <mesh material={material} castShadow>
              <boxGeometry args={[0.07, 0.26, 0.07]} />
            </mesh>
            <mesh material={material} castShadow position={[0, 0.05, 0]}>
              <boxGeometry args={[0.18, 0.07, 0.07]} />
            </mesh>
          </group>
        )}

        {/* Ring on the square: gold when selected, steel when free. */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={selected ? [0.42, 0.47, 48] : [0.36, 0.38, 40]} />
          <meshBasicMaterial
            color={selected ? '#e3c583' : owned ? '#8a6a2c' : '#6d7488'}
            transparent
            opacity={selected ? 0.95 : 0.55}
          />
        </mesh>
      </group>

      {/* Spotlight pool under the selected piece. */}
      {selected && (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.008, 0]}>
            <circleGeometry args={[0.85, 40]} />
            <meshBasicMaterial color="#d4ac5c" transparent opacity={0.13} />
          </mesh>
          <pointLight
            position={[0, height + 0.9, 0]}
            intensity={5}
            distance={3.4}
            color="#ffd9a0"
          />
        </>
      )}

      {/* Back-rank labels ride higher than the pawn labels in front of them,
          so the two rows of chips never collide on screen. */}
      <Html
        position={[0, height + (position.rank === 1 ? (isKing ? 0.82 : 0.6) : 0.24), 0]}
        center
        distanceFactor={7.5}
        /* Kept below the UI layer: the ownership panel sits at z-30, and these
           chips used to paint straight over it. */
        zIndexRange={[10, 0]}
        style={{
          pointerEvents: 'auto',
          // Recede while another piece is selected, so the open panel reads
          // as the foreground rather than fighting sixteen price tags.
          opacity: dimmed ? 0.35 : 1,
          transition: 'opacity .2s ease',
        }}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(position.slug);
          }}
          className={`flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-left backdrop-blur-sm transition ${
            owned
              ? isKing
                ? 'border-gold-400/70 bg-black/85 shadow-gold'
                : 'border-gold-400/35 bg-black/80'
              : 'border-white/20 bg-black/70'
          }`}
        >
          {labelMode === 'full' && owned && position.company?.logoUrl && (
            <img
              src={position.company.logoUrl}
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 rounded-full object-cover"
            />
          )}
          {labelMode === 'full' && owned && position.company && (
            <span
              className={`max-w-[92px] truncate text-[11px] font-medium tracking-wide ${
                isKing ? 'text-gold-200' : 'text-white/80'
              }`}
            >
              {position.company.name}
            </span>
          )}
          <span
            className={`text-[11px] font-semibold tabular-nums ${
              owned ? 'text-gold-300' : 'text-white/60'
            }`}
          >
            {price}
          </span>
        </button>
      </Html>
    </group>
  );
}
