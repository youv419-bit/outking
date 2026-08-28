'use client';

import {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type RefObject,
} from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import type { PositionView } from '@/lib/types';
import Piece from './Piece';

type OrbitControlsType = ComponentRef<typeof OrbitControls>;

/** Zoom is driven by the on-screen buttons, never by the wheel - see ZoomBridge. */
export type ZoomHandle = (factor: number) => void;

const MIN_DISTANCE = 4;
const MAX_DISTANCE = 14;
const HOME_TARGET = new THREE.Vector3(0, 0.65, -0.15);

/**
 * The arena is cropped to the ranks that actually hold positions.
 *
 * A full 8x8 board left six empty rows filling most of the frame - a big blank
 * slab that read as a rendering fault on first load. Three rows is enough to
 * say "chessboard": the back rank of major pieces, the pawn rank in front of
 * it, and one empty row behind for depth.
 */
const BOARD_FILES = 8;
const BOARD_ROWS = [0, 1, 2] as const; // 0 = decorative back row

const LIGHT_SQUARE = '#33333d';
const DARK_SQUARE = '#15151b';

/** Pawns (rank 2) sit nearest the camera, majors (rank 1) behind them. */
function squarePosition(file: number, rank: number): [number, number] {
  return [file - 3.5, rank - 1.5];
}

function Board() {
  const squares = useMemo(() => {
    const list: Array<{ key: string; x: number; z: number; light: boolean }> = [];
    for (let file = 0; file < BOARD_FILES; file += 1) {
      for (const row of BOARD_ROWS) {
        const [x, z] = squarePosition(file, row);
        list.push({ key: `${file}-${row}`, x, z, light: (file + row) % 2 === 0 });
      }
    }
    return list;
  }, []);

  return (
    <group>
      {/* Plinth. A little emissive so its edges stay readable even where no
          light reaches them - the base of the arena should always be legible. */}
      <mesh position={[0, -0.16, -0.5]} receiveShadow>
        <boxGeometry args={[9.4, 0.3, 4.6]} />
        <meshPhysicalMaterial
          color="#16161d"
          metalness={0.45}
          roughness={0.55}
          emissive="#0f1018"
          emissiveIntensity={0.6}
        />
      </mesh>
      {/* Gold rim, self-lit so it draws the full outline of the board on both
          sides regardless of where the key light falls. */}
      <mesh position={[0, -0.005, -0.5]}>
        <boxGeometry args={[8.5, 0.02, 3.7]} />
        <meshStandardMaterial
          color="#8a6630"
          metalness={1}
          roughness={0.35}
          emissive="#4a3413"
          emissiveIntensity={0.8}
        />
      </mesh>
      {squares.map((square) => (
        <mesh
          key={square.key}
          position={[square.x, 0, square.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
        >
          <planeGeometry args={[1, 1]} />
          <meshPhysicalMaterial
            color={square.light ? LIGHT_SQUARE : DARK_SQUARE}
            metalness={0.25}
            roughness={square.light ? 0.42 : 0.6}
            clearcoat={0.35}
          />
        </mesh>
      ))}
    </group>
  );
}

function CameraRig({
  focus,
  controls,
}: {
  focus: [number, number] | null;
  controls: RefObject<OrbitControlsType | null>;
}) {
  const target = useRef(HOME_TARGET.clone());
  const { camera } = useThree();

  useFrame((_, delta) => {
    const desired = focus
      ? new THREE.Vector3(focus[0] * 0.5, 0.8, focus[1] * 0.6)
      : HOME_TARGET.clone();
    target.current.lerp(desired, Math.min(1, delta * 2.4));
    const node = controls.current;
    if (node) {
      node.target.copy(target.current);
      node.update();
    } else {
      camera.lookAt(target.current);
    }
  });
  return null;
}

/**
 * Zoom without touching the wheel.
 *
 * OrbitControls binds the wheel to zoom, which traps page scrolling whenever
 * the pointer is over the canvas - you end up hunting for the scrollbar. So
 * `enableZoom` is off and zoom is exposed imperatively through `zoomRef`,
 * driven by the +/- buttons rendered over the canvas. The dolly is eased over
 * a few frames rather than snapped, so it still feels like a camera move.
 */
function ZoomBridge({
  zoomRef,
  controls,
}: {
  zoomRef: RefObject<ZoomHandle | null>;
  controls: RefObject<OrbitControlsType | null>;
}) {
  const { camera } = useThree();
  const desired = useRef<number | null>(null);

  useEffect(() => {
    zoomRef.current = (factor: number) => {
      const target = controls.current?.target ?? HOME_TARGET;
      const current = desired.current ?? camera.position.distanceTo(target);
      desired.current = THREE.MathUtils.clamp(current * factor, MIN_DISTANCE, MAX_DISTANCE);
    };
    return () => {
      zoomRef.current = null;
    };
  }, [camera, controls, zoomRef]);

  useFrame((_, delta) => {
    if (desired.current == null) return;
    const target = controls.current?.target ?? HOME_TARGET;
    const offset = camera.position.clone().sub(target);
    const distance = offset.length();
    const next = THREE.MathUtils.lerp(distance, desired.current, Math.min(1, delta * 7));
    camera.position.copy(target.clone().add(offset.setLength(next)));
    controls.current?.update();
    if (Math.abs(next - desired.current) < 0.02) desired.current = null;
  });

  return null;
}

/**
 * Every light is mirrored across the X axis.
 *
 * The first version had a single key light and two unpaired point lights, all
 * offset to one side. The result was a plinth that caught light on its left
 * edge and fell into pure black on the right - it read as half the board
 * being missing rather than as a lighting choice. Pairs cost a little more to
 * render and make the arena symmetrical from any camera angle.
 */
function Lights() {
  return (
    <>
      <ambientLight intensity={0.7} />
      <hemisphereLight args={['#dfe4ff', '#0d0d12', 0.8]} />

      {/* Key pair. Only one casts shadows - two shadow maps for a symmetric
          rig would double the cost to remove the shadows entirely. */}
      <directionalLight
        position={[6, 9, 6]}
        intensity={1.5}
        color="#fff3d8"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={30}
        shadow-camera-left={-7}
        shadow-camera-right={7}
        shadow-camera-top={7}
        shadow-camera-bottom={-7}
        shadow-bias={-0.0006}
      />
      <directionalLight position={[-6, 9, 6]} intensity={1.2} color="#fff0d2" />

      {/* Rim pair from behind: separates the pieces from the black background
          on both sides. */}
      <directionalLight position={[-5, 4, -7]} intensity={0.85} color="#9fb4ff" />
      <directionalLight position={[5, 4, -7]} intensity={0.85} color="#9fb4ff" />

      {/* Centred spot, wide enough to cover the full width of the plinth. */}
      <spotLight
        position={[0, 9, 3]}
        angle={0.85}
        penumbra={1}
        intensity={1.3}
        color="#ffd9a0"
        distance={28}
      />

      {/* Cool edge pair, so both ends of the plinth pick up the same accent. */}
      <pointLight position={[-7, 2.4, 0.5]} intensity={0.75} color="#5a6bff" />
      <pointLight position={[7, 2.4, 0.5]} intensity={0.75} color="#5a6bff" />
    </>
  );
}

export type SceneProps = {
  positions: PositionView[];
  selectedSlug: string | null;
  currency: string;
  zoomRef: RefObject<ZoomHandle | null>;
  onSelect: (slug: string | null) => void;
};

export default function Scene({
  positions,
  selectedSlug,
  currency,
  zoomRef,
  onSelect,
}: SceneProps) {
  const controls = useRef<OrbitControlsType | null>(null);
  const [quality, setQuality] = useState<'high' | 'low'>('high');
  const [labelMode, setLabelMode] = useState<'full' | 'compact'>('full');

  useEffect(() => {
    const apply = () => {
      const narrow = window.innerWidth < 720;
      setQuality(narrow ? 'low' : 'high');
      setLabelMode(narrow ? 'compact' : 'full');
    };
    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, []);

  const selected = positions.find((p) => p.slug === selectedSlug) ?? null;
  const focus = selected
    ? (squarePosition(selected.file, selected.rank) as [number, number])
    : null;

  return (
    <Canvas
      shadows
      dpr={[1, 1.8]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 4.6, 7.4], fov: 34, near: 0.1, far: 100 }}
      onPointerMissed={() => onSelect(null)}
      style={{ touchAction: 'none' }}
    >
      <color attach="background" args={['#050506']} />
      <fog attach="fog" args={['#050506', 14, 32]} />
      <Lights />
      <Suspense fallback={null}>
        <Board />
        {positions.map((position) => {
          const [x, z] = squarePosition(position.file, position.rank);
          return (
            <Piece
              key={position.slug}
              position={position}
              x={x}
              z={z}
              selected={position.slug === selectedSlug}
              dimmed={Boolean(selectedSlug) && position.slug !== selectedSlug}
              quality={quality}
              labelMode={labelMode}
              currency={currency}
              onSelect={onSelect}
            />
          );
        })}
        <ContactShadows
          position={[0, 0.002, 0]}
          opacity={0.5}
          scale={10}
          blur={2.4}
          far={4}
          resolution={512}
          color="#000000"
        />
      </Suspense>
      <CameraRig focus={focus} controls={controls} />
      <ZoomBridge zoomRef={zoomRef} controls={controls} />
      <OrbitControls
        ref={controls}
        makeDefault
        enablePan
        enableZoom={false}
        enableDamping
        dampingFactor={0.08}
        minDistance={MIN_DISTANCE}
        maxDistance={MAX_DISTANCE}
        maxPolarAngle={Math.PI / 2.15}
        minPolarAngle={0.25}
        panSpeed={0.6}
        rotateSpeed={0.7}
        touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.PAN }}
      />
    </Canvas>
  );
}
