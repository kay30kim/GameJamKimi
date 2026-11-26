"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { ReactNode } from "react";
import { MathUtils } from "three";
import type { Group, Texture } from "three";
import { PALETTE, ROUGHNESS } from "@/lib/harbir/style";

export type Vec3 = [number, number, number];

export function Mat({ color, rough = ROUGHNESS.soft, map }: { color: string; rough?: number; map?: Texture }) {
  return <meshStandardMaterial color={color} roughness={rough} map={map ?? null} />;
}

/** A sphere scaled into an ellipsoid: the basic shape of every soft character and plant. */
export function Blob({
  position = [0, 0, 0],
  scale,
  rotation,
  color,
  rough,
  shadow = true,
  map,
  children,
}: {
  position?: Vec3;
  scale: Vec3;
  rotation?: Vec3;
  color: string;
  rough?: number;
  shadow?: boolean;
  map?: Texture;
  children?: ReactNode;
}) {
  return (
    <mesh position={position} scale={scale} rotation={rotation} castShadow={shadow}>
      <sphereGeometry args={[1, 24, 16]} />
      <Mat color={color} rough={rough} map={map} />
      {children}
    </mesh>
  );
}

/**
 * The shared face from Alice's model: sparkly dark eyes, pink cheeks, a small nose and mouth.
 * Placed on the front of a head centered at `center` with radius `size`.
 */
export function Face({ center, size, nose = PALETTE.cheek, spread = 1, noseDepth = 0, mouthDepth = 0, mouthWidth = 1, speaking = false }: {
  center: Vec3; size: number; nose?: string | null; spread?: number;
  /** Move these features to the visible surface of a protruding muzzle or bill. */
  noseDepth?: number; mouthDepth?: number; mouthWidth?: number; speaking?: boolean;
}) {
  const [x, y, z] = center;
  const front = z + size * 0.92;
  const mouth = useRef<Group>(null);
  useFrame(({ clock }, delta) => {
    if (!mouth.current) return;
    const opening = speaking ? 1.8 + Math.sin(clock.elapsedTime * 17) * 0.55 : 1;
    mouth.current.scale.y = MathUtils.damp(mouth.current.scale.y, opening, 18, Math.min(delta, 0.05));
  });
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Blob position={[x + side * size * 0.34 * spread, y + size * 0.08, front]} scale={[size * 0.15, size * 0.2, size * 0.08]} color={PALETTE.eye} shadow={false} />
          <Blob position={[x + side * size * 0.34 * spread - size * 0.045, y + size * 0.15, front + size * 0.07]} scale={[size * 0.045, size * 0.055, size * 0.03]} color={PALETTE.sparkle} shadow={false} />
          <Blob position={[x + side * size * 0.58 * spread, y - size * 0.16, front - size * 0.12]} scale={[size * 0.15, size * 0.09, size * 0.05]} color={PALETTE.cheek} shadow={false} />
        </group>
      ))}
      {nose !== null && <Blob position={[x, y - size * 0.12, front + size * 0.06 + noseDepth]} scale={[size * 0.09, size * 0.07, size * 0.06]} color={nose} shadow={false} />}
      <group ref={mouth} position={[x, y - size * 0.3, front - size * 0.02 + mouthDepth]}>
        <Blob scale={[size * 0.08 * mouthWidth, size * 0.03, size * 0.04]} color={PALETTE.eye} shadow={false} />
      </group>
    </group>
  );
}

/** Seeded random numbers, so scattered scenery is the same on every render and every visit. */
export function seeded(seed: number) {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}
