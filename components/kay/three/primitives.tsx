"use client";

import { Color, CylinderGeometry, MeshStandardMaterial, SphereGeometry, BoxGeometry } from "three";
import type { ReactNode } from "react";

export type Vec3 = [number, number, number];
export const sphere = new SphereGeometry(1, 28, 20);
export const softSphere = new SphereGeometry(1, 12, 8);
export const box = new BoxGeometry(1, 1, 1);
export const cylinder = new CylinderGeometry(1, 1, 1, 16);
const materials = new Map<string, MeshStandardMaterial>();
export function material(color: string, roughness = 0.82, metalness = 0) {
  const key = `${color}:${roughness}:${metalness}`;
  let result = materials.get(key);
  if (!result) { result = new MeshStandardMaterial({ color: new Color(color), roughness, metalness }); materials.set(key, result); }
  return result;
}
export function Ellipsoid({ position, scale, rotation, color, roughness, children, shadow = true }: {
  position?: Vec3; scale: Vec3; rotation?: Vec3; color: string; roughness?: number; children?: ReactNode; shadow?: boolean;
}) {
  return <mesh geometry={sphere} material={material(color, roughness)} position={position} scale={scale} rotation={rotation} castShadow={shadow} receiveShadow>{children}</mesh>;
}
export function Block({ position, scale, rotation, color, shadow = true }: {
  position?: Vec3; scale: Vec3; rotation?: Vec3; color: string; shadow?: boolean;
}) {
  return <mesh geometry={box} material={material(color)} position={position} scale={scale} rotation={rotation} castShadow={shadow} receiveShadow />;
}
export function Beam({ position, scale, rotation, color, shadow = true }: {
  position?: Vec3; scale: Vec3; rotation?: Vec3; color: string; shadow?: boolean;
}) {
  return <mesh geometry={cylinder} material={material(color)} position={position} scale={scale} rotation={rotation} castShadow={shadow} receiveShadow />;
}
export function seeded(seed: number) {
  let state = seed;
  return () => ((state = (state * 16807) % 2147483647) - 1) / 2147483646;
}
