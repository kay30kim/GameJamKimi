"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { ReactNode } from "react";
import { Color, MathUtils, Object3D } from "three";
import type { Group, InstancedMesh, Material, Mesh, Vector3 } from "three";
import { PALETTE, ROUGHNESS } from "@/lib/harbir/style";
import { blocksForegroundView } from "@/lib/camera-director";
import { SAMPLES } from "./paths";
import { Mat, seeded } from "./primitives";
import type { Vec3 } from "./primitives";
import { useTexture } from "./textures";

export type Item = { position: Vec3; scale: Vec3; rotation?: Vec3; color?: string };

/** Many copies of one shape in a single draw call. Each item can have its own color. */
export function Instances({ items, children, shadow = false, rough = ROUGHNESS.matte }: {
  items: Item[];
  children: ReactNode;
  shadow?: boolean;
  rough?: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const color = new Color();
    items.forEach(({ position, scale, rotation = [0, 0, 0], color: tint = "#ffffff" }, i) => {
      dummy.position.set(...position);
      dummy.rotation.set(...rotation);
      dummy.scale.set(...scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(tint));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, items.length]} castShadow={shadow} receiveShadow>
      {children}
      <meshStandardMaterial roughness={rough} />
    </instancedMesh>
  );
}

/** Soft rolling hills far out in the fog, so the meadow has a horizon instead of an endless flat plane. */
export function Hills() {
  const items = useMemo(() => {
    const next = seeded(91);
    return Array.from({ length: 14 }, (_, i): Item => {
      const angle = (i / 14) * Math.PI * 2 + next() * 0.3;
      const radius = 40 + next() * 10;
      const width = 10 + next() * 8;
      return {
        position: [Math.cos(angle) * radius, -1.5, Math.sin(angle) * radius],
        scale: [width, 4 + next() * 4, width * (0.6 + next() * 0.3)],
        rotation: [0, -angle, 0],
        color: [PALETTE.grassDeep, PALETTE.leafLight, PALETTE.leaf][i % 3],
      };
    });
  }, []);
  return <Instances items={items}><sphereGeometry args={[1, 20, 12]} /></Instances>;
}

/** A wooden signpost on the village green, pointing down the paths. */
export function Signpost({ position }: { position: Vec3 }) {
  const wood = useTexture("wood");
  const ref = useRef<Group>(null);
  const materials = useRef<Material[] | null>(null);
  useFrame(({ camera }, delta) => {
    if (!materials.current) {
      const found: Material[] = [];
      ref.current?.traverse((object) => {
        const material = (object as Mesh).material;
        if (material) found.push(...(Array.isArray(material) ? material : [material]));
      });
      for (const material of found) material.transparent = true;
      materials.current = found;
    }
    const focus = camera.userData.storyFocus as Vector3 | undefined;
    const obscures = focus && blocksForegroundView(camera.position.toArray(), focus.toArray(), {
      x: position[0], z: position[2], radius: 0.62, bottom: position[1], top: position[1] + 1.42,
    });
    for (const material of materials.current) {
      // A sign is decorative; a child's view of the speaker takes precedence.
      material.opacity = MathUtils.damp(material.opacity, obscures ? 0.08 : 1, 12, Math.min(delta, 0.1));
      material.depthWrite = material.opacity > 0.95;
    }
  });
  return (
    <group ref={ref} position={position} rotation={[0, 0.3, 0]}>
      <mesh position={[0, 0.65, 0]} castShadow><cylinderGeometry args={[0.06, 0.07, 1.3, 8]} /><Mat color={PALETTE.woodDark} map={wood} /></mesh>
      <mesh position={[0.28, 1.08, 0]} rotation={[0, 0, 0.06]} castShadow><boxGeometry args={[0.6, 0.18, 0.05]} /><Mat color={PALETTE.wood} map={wood} /></mesh>
      <mesh position={[-0.24, 0.82, 0.02]} rotation={[0, 0.5, -0.05]} castShadow><boxGeometry args={[0.52, 0.16, 0.05]} /><Mat color={PALETTE.wood} map={wood} /></mesh>
      <mesh position={[0, 1.34, 0]}><sphereGeometry args={[0.07, 10, 8]} /><Mat color={PALETTE.woodDark} /></mesh>
    </group>
  );
}

/** Old tree stumps with bark sides and pale rings on top. */
export function Stumps({ points }: { points: { x: number; z: number; s: number }[] }) {
  const bark = useTexture("bark", 2, 0.5);
  return (
    <>
      {points.map(({ x, z, s }, i) => (
        <group key={i} position={[x, 0, z]} scale={s}>
          <mesh position={[0, 0.18, 0]} castShadow receiveShadow><cylinderGeometry args={[0.28, 0.34, 0.36, 12]} /><Mat color={PALETTE.trunk} map={bark} /></mesh>
          <mesh position={[0, 0.361, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.27, 16]} /><Mat color={PALETTE.wall} /></mesh>
          <mesh position={[0, 0.363, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.12, 0.15, 16]} /><Mat color={PALETTE.sand} /></mesh>
        </group>
      ))}
    </>
  );
}

const MUSHROOM_CAPS = [PALETTE.red, "#c98b5f", PALETTE.red, "#e8c9a0"] as const;

/** Little clusters of mushrooms: white stems with red or brown caps. */
export function Mushrooms({ points }: { points: { x: number; z: number; s: number; r: number }[] }) {
  const { stems, caps } = useMemo(() => {
    const next = seeded(73);
    const stems: Item[] = [], caps: Item[] = [];
    points.forEach(({ x, z, s, r }, i) => {
      const count = 2 + Math.floor(next() * 3);
      for (let k = 0; k < count; k++) {
        const size = s * (0.6 + next() * 0.6);
        const px = x + Math.cos(r + k * 2.1) * 0.22 * k, pz = z + Math.sin(r + k * 2.1) * 0.22 * k;
        stems.push({ position: [px, 0.08 * size, pz], scale: [size, size, size], color: PALETTE.wall });
        caps.push({ position: [px, 0.16 * size, pz], scale: [size, size * 0.7, size], color: MUSHROOM_CAPS[(i + k) % MUSHROOM_CAPS.length] });
      }
    });
    return { stems, caps };
  }, [points]);
  return (
    <>
      <Instances items={stems}><cylinderGeometry args={[0.035, 0.045, 0.16, 6]} /></Instances>
      <Instances items={caps} shadow rough={ROUGHNESS.satin}><sphereGeometry args={[0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} /></Instances>
    </>
  );
}

/** Mossy boulders: squashed, tilted spheres in stone tones. */
export function Boulders({ points }: { points: { x: number; z: number; s: number; r: number }[] }) {
  const items = useMemo(() => points.map(({ x, z, s, r }, i): Item => ({
    position: [x, 0.05, z],
    scale: [s * 0.45, s * 0.26, s * 0.38],
    rotation: [0.15, r, 0.1],
    color: ["#a8a597", "#9da48d", "#b3ad9e"][i % 3],
  })), [points]);
  return <Instances items={items} shadow><icosahedronGeometry args={[1, 1]} /></Instances>;
}

/** A rustic post-and-rail fence along the outside of the village loop, behind the house and garden. */
export function Fence({ from, to }: { from: number; to: number }) {
  const { posts, rails } = useMemo(() => {
    const loop = SAMPLES[0];
    const posts: Item[] = [], rails: Item[] = [];
    let last: Vec3 | null = null;
    for (let i = Math.round(loop.length * from); i <= Math.round(loop.length * to); i += 6) {
      const { x, z, half, nx, nz } = loop[i];
      const off = -(half + 0.45); // the loop's normal points inward, so step outward
      const p: Vec3 = [x + nx * off, 0, z + nz * off];
      posts.push({ position: [p[0], 0.32, p[2]], scale: [1, 1, 1], color: PALETTE.woodDark });
      if (last) {
        const dx = p[0] - last[0], dz = p[2] - last[2];
        const length = Math.hypot(dx, dz);
        const yaw = -Math.atan2(dz, dx);
        for (const y of [0.25, 0.48]) {
          rails.push({ position: [(p[0] + last[0]) / 2, y, (p[2] + last[2]) / 2], scale: [length, 1, 1], rotation: [0, yaw, 0], color: PALETTE.wood });
        }
      }
      last = p;
    }
    return { posts, rails };
  }, [from, to]);
  return (
    <>
      <Instances items={posts} shadow><boxGeometry args={[0.09, 0.64, 0.09]} /></Instances>
      <Instances items={rails} shadow><boxGeometry args={[1, 0.06, 0.04]} /></Instances>
    </>
  );
}
