"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, MathUtils, Object3D, Vector3 } from "three";
import type { Group, InstancedMesh, Material } from "three";
import { standingPoint } from "@/lib/harbir/sim";
import type { Point } from "@/lib/harbir/sim";
import { CAMERA, PALETTE, ROUGHNESS } from "@/lib/harbir/style";
import { SPOTS } from "@/lib/world";
import type { Spot } from "@/lib/world";
import { Blob, Mat, seeded } from "./primitives";
import type { Vec3 } from "./primitives";
import { pathClearance, pathEdges, ribbonGeometry, SAMPLES } from "./paths";
import { Boulders, Fence, Hills, Mushrooms, Signpost, Stumps } from "./scenery";
import { useTexture } from "./textures";

const at = (spot: Spot, y = 0): Vec3 => [SPOTS[spot].position[0], y, SPOTS[spot].position[1]];
const TUFT_GREENS = [PALETTE.grassDeep, PALETTE.leafLight, PALETTE.stem, PALETTE.leafWarm] as const;
const OTHER_SPOTS = (Object.keys(SPOTS) as Spot[]).filter((spot) => spot !== "path");

export function Tree({ position, scale = 1, apples = false }: { position: Vec3; scale?: number; apples?: boolean }) {
  const bark = useTexture("bark", 2, 1);
  const leaves = useTexture("leaves", 2, 1);
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.9, 0]} castShadow><cylinderGeometry args={[0.16, 0.26, 1.8, 10]} /><Mat color={PALETTE.trunk} map={bark} /></mesh>
      <Blob position={[0, 2.25, 0]} scale={[1, 0.92, 1]} color={PALETTE.leaf} rough={ROUGHNESS.matte} map={leaves} />
      <Blob position={[-0.62, 1.95, 0.15]} scale={[0.72, 0.66, 0.72]} color={PALETTE.leafLight} rough={ROUGHNESS.matte} map={leaves} />
      <Blob position={[0.6, 2.05, -0.12]} scale={[0.7, 0.64, 0.7]} color={PALETTE.leafWarm} rough={ROUGHNESS.matte} map={leaves} />
      <Blob position={[0.1, 2.85, 0.1]} scale={[0.6, 0.5, 0.6]} color={PALETTE.leafLight} rough={ROUGHNESS.matte} map={leaves} />
      {apples && [[-0.5, 2.1, 0.75], [0.55, 2.3, 0.6], [0.05, 1.8, 0.92], [0.8, 1.85, 0.25]].map((p, i) => (
        <Blob key={i} position={p as Vec3} scale={[0.11, 0.11, 0.11]} color={PALETTE.red} rough={ROUGHNESS.satin} />
      ))}
    </group>
  );
}

/**
 * Foreground trees yield to the actual view ray, including reverse dialogue shots.
 */
function SceneryTree({ position, scale }: { position: Vec3; scale: number }) {
  const ref = useRef<Group>(null);
  const materials = useRef<Material[] | null>(null);
  const direction = useMemo(() => new Vector3(), []);
  useFrame(({ camera }, delta) => {
    if (!materials.current) {
      const found: Material[] = [];
      ref.current?.traverse((object) => {
        const material = (object as { material?: Material }).material;
        if (material) found.push(material);
      });
      for (const material of found) material.transparent = true;
      materials.current = found;
    }
    camera.getWorldDirection(direction);
    const focus = camera.userData.storyFocus as Vector3 | undefined;
    const fx = focus?.x ?? camera.position.x + direction.x * CAMERA.distance;
    const fz = focus?.z ?? camera.position.z + direction.z * CAMERA.distance;
    const dx = camera.position.x - fx, dz = camera.position.z - fz;
    const length2 = dx * dx + dz * dz;
    const along = length2 > 0.01 ? ((position[0] - fx) * dx + (position[2] - fz) * dz) / length2 : -1;
    const distance = Math.hypot(position[0] - fx - along * dx, position[2] - fz - along * dz);
    const inCorridor = along > 0.06 && along < 1.15 && distance < 0.65 + scale * 1.2;
    for (const material of materials.current) {
      material.opacity = MathUtils.damp(material.opacity, inCorridor ? 0.18 : 1, 6, delta);
      material.depthWrite = material.opacity > 0.95;
    }
  });
  return <group ref={ref}><Tree position={position} scale={scale} /></group>;
}

function Bush({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  const leaves = useTexture("leaves", 2, 1);
  return (
    <group position={position} scale={scale}>
      <Blob position={[-0.3, 0.3, 0]} scale={[0.45, 0.4, 0.42]} color={PALETTE.bushLight} rough={ROUGHNESS.matte} map={leaves} />
      <Blob position={[0.05, 0.42, 0]} scale={[0.5, 0.48, 0.46]} color={PALETTE.bush} rough={ROUGHNESS.matte} map={leaves} />
      <Blob position={[0.38, 0.28, 0.05]} scale={[0.4, 0.36, 0.38]} color={PALETTE.bushLight} rough={ROUGHNESS.matte} map={leaves} />
    </group>
  );
}

function House() {
  const plaster = useTexture("plaster", 2, 1.5);
  const roof = useTexture("roof", 3, 2);
  const wood = useTexture("wood", 1, 2);
  return (
    <group position={at("home")}>
      <mesh position={[0, 0.95, 0]} castShadow receiveShadow><boxGeometry args={[2.8, 1.9, 2.3]} /><Mat color={PALETTE.wall} map={plaster} /></mesh>
      <mesh position={[0, 2.45, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[2.35, 1.3, 4]} /><Mat color={PALETTE.roof} map={roof} /></mesh>
      <mesh position={[0.85, 2.6, -0.4]} castShadow><boxGeometry args={[0.35, 0.8, 0.35]} /><Mat color={PALETTE.woodDark} map={plaster} /></mesh>
      <mesh position={[0, 0.6, 1.16]}><boxGeometry args={[0.7, 1.2, 0.05]} /><Mat color={PALETTE.door} map={wood} /></mesh>
      <Blob position={[0.22, 0.6, 1.2]} scale={[0.05, 0.05, 0.03]} color={PALETTE.gold} shadow={false} />
      {[-0.85, 0.85].map((x) => (
        <group key={x} position={[x, 1.2, 1.16]}>
          <mesh><boxGeometry args={[0.55, 0.55, 0.05]} /><Mat color={PALETTE.glass} rough={ROUGHNESS.shiny} /></mesh>
          <mesh position={[0, -0.33, 0.08]}><boxGeometry args={[0.65, 0.12, 0.18]} /><Mat color={PALETTE.wood} /></mesh>
          {[-0.2, 0, 0.2].map((fx, i) => <Blob key={fx} position={[fx, -0.22, 0.1]} scale={[0.07, 0.07, 0.07]} color={PALETTE.flowers[i]} shadow={false} />)}
        </group>
      ))}
      {[0.7, 1.25].map((z) => <mesh key={z} position={[0, 0.01, 1.2 + z]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.28, 16]} /><Mat color={PALETTE.stone} map={plaster} /></mesh>)}
    </group>
  );
}

function Bench() {
  const wood = useTexture("wood");
  return (
    <group position={at("bench")}>
      <mesh position={[0, 0.45, 0]} castShadow receiveShadow><boxGeometry args={[1.9, 0.12, 0.55]} /><Mat color={PALETTE.wood} map={wood} /></mesh>
      <mesh position={[0, 0.82, -0.24]} castShadow><boxGeometry args={[1.9, 0.42, 0.1]} /><Mat color={PALETTE.wood} map={wood} /></mesh>
      {[-0.8, 0.8].map((x) => <mesh key={x} position={[x, 0.22, 0]} castShadow><boxGeometry args={[0.12, 0.45, 0.5]} /><Mat color={PALETTE.woodDark} map={wood} /></mesh>)}
      <Bush position={[-1.6, 0, -0.5]} scale={0.6} />
      <Bush position={[1.6, 0, -0.5]} scale={0.55} />
    </group>
  );
}

function Pond() {
  const dirt = useTexture("dirt", 2);
  return (
    <group position={at("pond", 0.01)}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} scale={[1.25, 1, 1]} receiveShadow><circleGeometry args={[2, 48]} /><Mat color={PALETTE.sand} map={dirt} /></mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.25, 1, 1]}><circleGeometry args={[1.7, 48]} /><Mat color={PALETTE.waterDeep} rough={ROUGHNESS.shiny} /></mesh>
      <mesh position={[0, 0.015, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.25, 1, 1]}><ringGeometry args={[1.3, 1.7, 48]} /><Mat color={PALETTE.water} rough={ROUGHNESS.shiny} /></mesh>
      {[[-0.8, 0.4], [0.6, -0.5], [1.1, 0.5]].map(([x, z]) => (
        <mesh key={`${x}${z}`} position={[x, 0.03, z]} rotation={[-Math.PI / 2, 0, x]}><circleGeometry args={[0.24, 16, 0.4, Math.PI * 1.8]} /><Mat color={PALETTE.leafLight} /></mesh>
      ))}
      {Array.from({ length: 9 }, (_, i) => {
        const angle = (i / 9) * Math.PI * 2;
        return <Blob key={i} position={[Math.cos(angle) * 2.45, 0.08, Math.sin(angle) * 1.95]} scale={[0.2, 0.12, 0.17]} color={PALETTE.stone} />;
      })}
      {[-2.2, -2.05, 2.2].map((x, i) => <mesh key={i} position={[x, 0.45, -0.8 + i * 0.25]} castShadow><cylinderGeometry args={[0.03, 0.03, 0.9, 6]} /><Mat color={PALETTE.stem} /></mesh>)}
    </group>
  );
}

function Garden() {
  const flowers = useMemo(() => Array.from({ length: 24 }, (_, i) => ({
    x: -1.3 + (i % 6) * 0.52,
    z: -1.1 + Math.floor(i / 6) * 0.45,
    color: PALETTE.flowers[i % 4],
  })), []);
  const dirt = useTexture("dirt", 2, 1.3);
  const wood = useTexture("wood", 1, 0.3);
  return (
    <group position={at("garden")}>
      <mesh position={[0, 0.03, -0.45]} castShadow receiveShadow><boxGeometry args={[3.2, 0.06, 2]} /><Mat color={PALETTE.soil} map={dirt} /></mesh>
      {flowers.map(({ x, z, color }, i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.2, 0]}><cylinderGeometry args={[0.025, 0.025, 0.36, 6]} /><Mat color={PALETTE.stem} /></mesh>
          <Blob position={[0, 0.42, 0]} scale={[0.12, 0.1, 0.12]} color={color} />
          <Blob position={[0, 0.44, 0]} scale={[0.045, 0.045, 0.045]} color={PALETTE.flowers[0]} shadow={false} />
        </group>
      ))}
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-1.8 + i * 0.45, 0.3, -1.6]} castShadow><boxGeometry args={[0.12, 0.6, 0.06]} /><Mat color={PALETTE.wall} map={wood} /></mesh>
      ))}
      <mesh position={[0, 0.42, -1.6]}><boxGeometry args={[3.7, 0.08, 0.05]} /><Mat color={PALETTE.wall} /></mesh>
    </group>
  );
}

function Playground() {
  const dirt = useTexture("dirt", 2.5);
  const wood = useTexture("wood");
  return (
    <group position={at("playground")}>
      <mesh position={[0, 0.01, -0.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[2.6, 40]} /><Mat color={PALETTE.sand} map={dirt} /></mesh>
      <group position={[-1.3, 0, -0.8]}>
        {[-0.75, 0.75].map((x) => <mesh key={x} position={[x, 1.05, 0]} rotation={[0, 0, x > 0 ? 0.08 : -0.08]} castShadow><cylinderGeometry args={[0.07, 0.07, 2.1, 10]} /><Mat color={PALETTE.playYellow} /></mesh>)}
        <mesh position={[0, 2.08, 0]} rotation={[0, 0, Math.PI / 2]} castShadow><cylinderGeometry args={[0.07, 0.07, 1.7, 10]} /><Mat color={PALETTE.playYellow} /></mesh>
        {[-0.18, 0.18].map((x) => <mesh key={x} position={[x, 1.3, 0]}><cylinderGeometry args={[0.012, 0.012, 1.55, 4]} /><Mat color={PALETTE.woodDark} /></mesh>)}
        <mesh position={[0, 0.52, 0]} castShadow><boxGeometry args={[0.6, 0.08, 0.3]} /><Mat color={PALETTE.roof} map={wood} /></mesh>
      </group>
      <group position={[1.4, 0, -0.9]}>
        <mesh position={[0, 0.75, -0.6]} castShadow><boxGeometry args={[0.8, 1.5, 0.8]} /><Mat color={PALETTE.playBlue} /></mesh>
        <mesh position={[0, 1.56, -0.6]} castShadow><coneGeometry args={[0.65, 0.5, 4]} /><Mat color={PALETTE.playYellow} /></mesh>
        <mesh position={[0, 0.75, 0.5]} rotation={[0.85, 0, 0]} castShadow><boxGeometry args={[0.66, 0.08, 1.9]} /><Mat color={PALETTE.playOrange} /></mesh>
      </group>
    </group>
  );
}

/** Where characters stand at each spot; scenery stays off the straight walks between them. */
const STANDING = (Object.keys(SPOTS) as Spot[]).map((spot) => standingPoint(spot));

function distanceToWalk(x: number, z: number, [ax, az]: Point, [bx, bz]: Point) {
  const dx = bx - ax, dz = bz - az;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - ax - t * dx, z - az - t * dz);
}

/** Within 3.4 m of a landmark, 0.8 m of a path edge, or 1.5 m of a walk between spots, nothing gets scattered. */
function isClear(x: number, z: number) {
  if (Math.hypot(x, z) < 2.6) return false;
  for (const spot of OTHER_SPOTS) {
    const [sx, sz] = SPOTS[spot].position;
    if (Math.hypot(x - sx, z - sz) < 3.4) return false;
  }
  for (let i = 0; i < STANDING.length; i++) {
    for (let j = i + 1; j < STANDING.length; j++) if (distanceToWalk(x, z, STANDING[i], STANDING[j]) < 1.5) return false;
  }
  return pathClearance(x, z) > 0.8;
}

function scatter(seed: number, count: number, min: number, max: number) {
  const next = seeded(seed);
  const points: { x: number; z: number; s: number; r: number }[] = [];
  for (let tries = 0; points.length < count && tries < count * 40; tries++) {
    const angle = next() * Math.PI * 2;
    const radius = min + Math.sqrt(next()) * (max - min);
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    if (isClear(x, z)) points.push({ x, z, s: 0.7 + next() * 0.6, r: next() * Math.PI * 2 });
  }
  return points;
}

/** Thousands of small things (flowers, grass) drawn in one go with instancing. */
function Instanced({ points, height, color, colors, geometry }: {
  points: { x: number; z: number; s: number; r: number }[];
  height: number;
  color?: string;
  colors?: readonly string[];
  geometry: "flower" | "tuft" | "pebble";
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    points.forEach(({ x, z, s, r }, i) => {
      dummy.position.set(x, height * s, z);
      dummy.rotation.set(0, r, 0);
      if (geometry === "pebble") dummy.scale.set(s, s * 0.45, s * 0.8);
      else dummy.scale.setScalar(s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      if (colors) mesh.setColorAt(i, new Color(colors[i % colors.length]));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [points, height, colors, geometry]);
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, points.length]} castShadow={geometry === "flower"}>
      {geometry === "flower" ? <sphereGeometry args={[0.1, 8, 6]} /> : geometry === "pebble" ? <sphereGeometry args={[0.09, 7, 5]} /> : <coneGeometry args={[0.08, 0.24, 5]} />}
      <meshStandardMaterial color={color ?? "white"} roughness={ROUGHNESS.matte} />
    </instancedMesh>
  );
}

const PEBBLE_TONES = [PALETTE.stone, PALETTE.sand, "#b9b2a4", "#ddd6c8"] as const;

function PathRibbon({ index }: { index: number }) {
  const dirt = useTexture("dirt");
  const fade = useTexture("edgeFade");
  const geometry = useMemo(() => ribbonGeometry(SAMPLES[index]), [index]);
  return (
    <mesh geometry={geometry} position={[0, 0.004 + index * 0.0003, 0]} renderOrder={2} receiveShadow>
      <meshStandardMaterial color={PALETTE.path} roughness={ROUGHNESS.soft} map={dirt} alphaMap={fade} transparent depthWrite={false} />
    </mesh>
  );
}

/** A soft, worn patch of bare ground, such as where characters stand in front of a landmark. */
function WornPatch({ x, z, radius, color = PALETTE.path }: { x: number; z: number; radius: number; color?: string }) {
  const dirt = useTexture("dirt", 1.5);
  const softEdge = useTexture("softEdge");
  return (
    <mesh position={[x, 0.007, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.15, 1, 1]} renderOrder={3} receiveShadow>
      <circleGeometry args={[radius, 32]} />
      <meshStandardMaterial color={color} roughness={ROUGHNESS.soft} map={dirt} alphaMap={softEdge} transparent depthWrite={false} />
    </mesh>
  );
}

/** The open meadow: grass fading into far hills, a winding village loop past every landmark, and scenery. */
export function Meadow() {
  const trees = useMemo(() => scatter(11, 70, 10, 34), []);
  const nearTrees = useMemo(() => scatter(12, 10, 5, 10), []);
  const bushes = useMemo(() => scatter(21, 60, 4, 30), []);
  const flowers = useMemo(() => scatter(31, 420, 3, 26), []);
  const tufts = useMemo(() => scatter(41, 900, 3, 30), []);
  const patches = useMemo(() => scatter(51, 30, 4, 40), []);
  const mushrooms = useMemo(() => scatter(71, 16, 4, 20), []);
  const stumps = useMemo(() => scatter(81, 6, 5, 18), []);
  const boulders = useMemo(() => scatter(85, 22, 4, 30).map((p) => ({ ...p, s: p.s * 1.1 })), []);
  const edges = useMemo(() => pathEdges(), []);
  const grass = useTexture("grass", 100);
  const patchGrass = useTexture("grass", 1.5);
  const softEdge = useTexture("softEdge");
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><planeGeometry args={[400, 400]} /><Mat color={PALETTE.grass} rough={ROUGHNESS.matte} map={grass} /></mesh>
      {patches.map(({ x, z, s }, i) => (
        <mesh key={i} position={[x, 0.002, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[s * 2.6, s * 1.7, 1]} renderOrder={1} receiveShadow>
          <circleGeometry args={[1.6, 24]} />
          <meshStandardMaterial color={PALETTE.grassDeep} roughness={ROUGHNESS.matte} map={patchGrass} alphaMap={softEdge} transparent depthWrite={false} />
        </mesh>
      ))}
      {SAMPLES.map((_, i) => <PathRibbon key={i} index={i} />)}
      <WornPatch x={0} z={0} radius={1.9} color={PALETTE.clearing} />
      {OTHER_SPOTS.map((spot) => {
        const [x, z] = SPOTS[spot].position;
        return <WornPatch key={spot} x={x} z={z + 1.6} radius={1.1} />;
      })}
      <House />
      <Tree position={at("tree")} scale={1.6} apples />
      <Bench />
      <Pond />
      <Garden />
      <Playground />
      <Signpost position={[-1.7, 0, 1.2]} />
      <Fence from={0.8} to={0.98} />
      <Hills />
      <Stumps points={stumps} />
      <Mushrooms points={mushrooms} />
      <Boulders points={boulders} />
      {[...trees, ...nearTrees].map(({ x, z, s }, i) => <SceneryTree key={`t${i}`} position={[x, 0, z]} scale={s * 1.2} />)}
      {bushes.map(({ x, z, s, r }, i) => <group key={`b${i}`} position={[x, 0, z]} rotation={[0, r, 0]}><Bush position={[0, 0, 0]} scale={s} /></group>)}
      <Instanced points={flowers} height={0.14} colors={PALETTE.flowers} geometry="flower" />
      <Instanced points={tufts} height={0.13} colors={TUFT_GREENS} geometry="tuft" />
      <Instanced points={edges.tufts} height={0.13} colors={TUFT_GREENS} geometry="tuft" />
      <Instanced points={edges.pebbles} height={0.02} colors={PEBBLE_TONES} geometry="pebble" />
    </>
  );
}
