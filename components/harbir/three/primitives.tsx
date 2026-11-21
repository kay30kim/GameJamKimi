"use client";

import type { ReactNode } from "react";
import { PALETTE, ROUGHNESS } from "@/lib/harbir/style";

export type Vec3 = [number, number, number];

export function Mat({ color, rough = ROUGHNESS.soft }: { color: string; rough?: number }) {
  return <meshStandardMaterial color={color} roughness={rough} />;
}

/** A sphere scaled into an ellipsoid: the basic shape of every soft character and plant. */
export function Blob({
  position = [0, 0, 0],
  scale,
  rotation,
  color,
  rough,
  shadow = true,
  children,
}: {
  position?: Vec3;
  scale: Vec3;
  rotation?: Vec3;
  color: string;
  rough?: number;
  shadow?: boolean;
  children?: ReactNode;
}) {
  return (
    <mesh position={position} scale={scale} rotation={rotation} castShadow={shadow}>
      <sphereGeometry args={[1, 24, 16]} />
      <Mat color={color} rough={rough} />
      {children}
    </mesh>
  );
}

/**
 * The shared face from Kimi's model: sparkly dark eyes, pink cheeks, a small nose and mouth.
 * Placed on the front of a head centered at `center` with radius `size`.
 */
export function Face({ center, size, nose = PALETTE.cheek, spread = 1 }: { center: Vec3; size: number; nose?: string; spread?: number }) {
  const [x, y, z] = center;
  const front = z + size * 0.92;
  return (
    <group>
      {[-1, 1].map((side) => (
        <group key={side}>
          <Blob position={[x + side * size * 0.34 * spread, y + size * 0.08, front]} scale={[size * 0.15, size * 0.2, size * 0.08]} color={PALETTE.eye} shadow={false} />
          <Blob position={[x + side * size * 0.34 * spread - size * 0.045, y + size * 0.15, front + size * 0.07]} scale={[size * 0.045, size * 0.055, size * 0.03]} color={PALETTE.sparkle} shadow={false} />
          <Blob position={[x + side * size * 0.58 * spread, y - size * 0.16, front - size * 0.12]} scale={[size * 0.15, size * 0.09, size * 0.05]} color={PALETTE.cheek} shadow={false} />
        </group>
      ))}
      <Blob position={[x, y - size * 0.12, front + size * 0.06]} scale={[size * 0.09, size * 0.07, size * 0.06]} color={nose} shadow={false} />
      <Blob position={[x, y - size * 0.3, front - size * 0.02]} scale={[size * 0.08, size * 0.03, size * 0.04]} color={PALETTE.eye} shadow={false} />
    </group>
  );
}

/** Seeded random numbers, so scattered scenery is the same on every render and every visit. */
export function seeded(seed: number) {
  let state = seed;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}
