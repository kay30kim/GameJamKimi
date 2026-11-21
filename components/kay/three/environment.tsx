"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { Color, Object3D, PlaneGeometry, Shape, ShapeGeometry, Vector2, LatheGeometry, DoubleSide, DataTexture, RGBAFormat, SRGBColorSpace, LinearFilter } from "three";
import type { EulerOrder, Group, InstancedMesh, Mesh, MeshStandardMaterial } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Beam, Block, Ellipsoid as E, material, seeded, softSphere, sphere, box, cylinder } from "./primitives";
import type { Vec3 } from "./primitives";

const LEAVES = ["#386d4e", "#4e8553", "#73a263", "#9dbb76", "#547d48"];
const FLOWERS = ["#f6c66e", "#efa3a0", "#bba1d5", "#f3d787", "#fff0d7", "#c080a7"];
const CLEARINGS = [[0, 0], [-4.8, 0.2], [4.3, 0.4], [-3.8, -3.5]];
export const LOCATION_CENTERS = { meadow: [0, 0, 0], garden: [-4.8, 0, 0.2], pond: [4.3, 0, 0.4], cottage: [-3.8, 0, -3.5] } as const;

const roofTile = new RoundedBoxGeometry(1, 1, 1, 2, 0.16);
interface Instance { position: Vec3; scale: Vec3; rotation?: Vec3; order?: EulerOrder; color: string }
function Instances({ entries, shape = "sphere", shadows = true, roughness = 0.9 }: {
  entries: Instance[]; shape?: "sphere" | "box" | "cylinder" | "tile"; shadows?: boolean; roughness?: number;
}) {
  const ref = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const dummy = new Object3D();
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      dummy.position.set(...entry.position); dummy.scale.set(...entry.scale);
      dummy.rotation.set(...(entry.rotation ?? [0, 0, 0]), entry.order ?? "XYZ"); dummy.updateMatrix();
      ref.current.setMatrixAt(i, dummy.matrix); ref.current.setColorAt(i, new Color(entry.color));
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
    ref.current.computeBoundingSphere();
  }, [entries]);
  return <instancedMesh ref={ref} args={[shape === "tile" ? roofTile : shape === "box" ? box : shape === "cylinder" ? cylinder : softSphere, undefined, entries.length]} castShadow={shadows} receiveShadow>
    <meshStandardMaterial roughness={roughness} />
  </instancedMesh>;
}

function Ground() {
  const clearingTexture = useMemo(() => {
    const size = 128, data = new Uint8Array(size * size * 4), rng = seeded(271);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const nx = x / size * 2 - 1, ny = y / size * 2 - 1, angle = Math.atan2(ny, nx);
      const radius = Math.hypot(nx, ny) + Math.sin(angle * 5) * 0.025 + Math.cos(angle * 7) * 0.018;
      const edge = Math.max(0, Math.min(1, (0.98 - radius) / 0.18));
      const grain = rng() * 10;
      const i = (y * size + x) * 4;
      data[i] = 205 + grain; data[i + 1] = 192 + grain; data[i + 2] = 148 + grain;
      data[i + 3] = Math.round(edge * edge * (3 - 2 * edge) * 245);
    }
    const texture = new DataTexture(data, size, size, RGBAFormat);
    texture.colorSpace = SRGBColorSpace; texture.magFilter = LinearFilter; texture.minFilter = LinearFilter; texture.needsUpdate = true;
    return texture;
  }, []);
  const terrain = useMemo(() => {
    const geometry = new PlaneGeometry(170, 170, 70, 70);
    geometry.rotateX(-Math.PI / 2);
    const vertices = geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const x = vertices.getX(i), z = vertices.getZ(i);
      const r = Math.hypot(x, z);
      vertices.setY(i, r < 14 ? -0.04 : Math.sin(x * 0.09 + z * 0.055) * Math.cos(z * 0.13) * Math.min(4.7, (r - 14) * 0.18) - 0.05);
    }
    geometry.computeVertexNormals(); return geometry;
  }, []);
  const path = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-2.6, 9); shape.bezierCurveTo(-2.2, 4, -1.3, 4.6, -1.45, 1.8);
    shape.bezierCurveTo(-4, -0.1, -6.5, -0.3, -7, -4.3); shape.lineTo(-5.8, -4.5);
    shape.bezierCurveTo(-5.3, -1, -2.8, -1.2, -0.15, 0.4);
    shape.bezierCurveTo(2, 1, 4.4, -1.2, 5.8, -2); shape.lineTo(6.5, -1);
    shape.bezierCurveTo(4.6, 0.9, 1.4, 3.1, 0.45, 3.6); shape.bezierCurveTo(-0.4, 6.7, -0.1, 7, -0.8, 9); shape.closePath();
    const geometry = new ShapeGeometry(shape, 36);
    geometry.scale(1, -1, 1);
    return geometry;
  }, []);
  return <>
    <mesh geometry={terrain} receiveShadow><meshStandardMaterial color="#719651" roughness={1} /></mesh>
    <mesh geometry={path} position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><meshStandardMaterial color="#d9c39c" roughness={1} side={DoubleSide} /></mesh>
    {CLEARINGS.map(([x, z], i) => <mesh key={i} position={[x, 0.012 + i * 0.001, z]} rotation={[-Math.PI / 2, 0, 0]} scale={[i === 0 ? 3.7 : 2.9, i === 0 ? 3.1 : 2.3, 1]} receiveShadow><planeGeometry args={[2, 2]} /><meshStandardMaterial map={clearingTexture} transparent depthWrite={false} roughness={1} /></mesh>)}
  </>;
}

function Forest() {
  const { trunks, leaves, roots, hills } = useMemo(() => {
    const rng = seeded(71), trunks: Instance[] = [], leaves: Instance[] = [], roots: Instance[] = [], hills: Instance[] = [];
    const positions = [[5, -7, 1.4], [-10, -6, 1.1], [10, -8, 1.15], [-12, -1, 0.9], [13, -1, 1], [-4, -13, 1.35], [1, -15, 1.7], [-15, -12, 1.5], [16, -13, 1.5], [9, -17, 1.1], [-8, -20, 1.3], [19, -22, 1.8], [-22, -21, 1.6], [2, -25, 1.7], [24, -16, 1.3], [-18, -3, 1.25], [19, -5, 1.1]];
    for (const [x, z, s] of positions) {
      const height = 3.4 * s;
      trunks.push({ position: [x, height / 2, z], scale: [0.25 * s, height, 0.3 * s], rotation: [0, rng() * 2, 0.04], color: "#896a45" });
      for (let i = 0; i < 4; i++) {
        const a = i * 1.8;
        trunks.push({ position: [x + Math.sin(a) * 0.5 * s, height * 0.73, z + Math.cos(a) * 0.5 * s], scale: [0.13 * s, 1.6 * s, 0.14 * s], rotation: [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5], color: "#896a45" });
        roots.push({ position: [x + Math.sin(a) * 0.28 * s, 0.12, z + Math.cos(a) * 0.28 * s], scale: [0.15 * s, 0.13, 0.65 * s], rotation: [0, a, 0], color: "#8b7046" });
      }
      for (let i = 0; i < 16; i++) {
        const a = rng() * Math.PI * 2, rad = Math.sqrt(rng()) * 1.75 * s;
        const size = (0.65 + rng() * 0.53) * s;
        leaves.push({ position: [x + Math.sin(a) * rad, height + 0.4 + rng() * 1.2 * s - rad * 0.13, z + Math.cos(a) * rad], scale: [size, size * (0.58 + rng() * 0.3), size * 0.9], rotation: [rng(), rng(), rng()], color: LEAVES[Math.floor(rng() * LEAVES.length)] });
      }
    }
    for (let i = 0; i < 20; i++) hills.push({ position: [(i - 10) * 7, -1.5, -32 - rng() * 20], scale: [9 + rng() * 9, 4 + rng() * 5, 9], color: i % 2 ? "#8eae91" : "#a3bc9b" });
    return { trunks, leaves, roots, hills };
  }, []);
  return <><Instances entries={hills} shadows={false} /><Instances entries={trunks} shape="cylinder" /><Instances entries={roots} /><Instances entries={leaves} /></>;
}

function Wildflowers() {
  const { blades, foliage, blossoms, stones, mushrooms } = useMemo(() => {
    const rng = seeded(249), blades: Instance[] = [], foliage: Instance[] = [], blossoms: Instance[] = [], stones: Instance[] = [], mushrooms: Instance[] = [];
    for (let i = 0; i < 1550; i++) {
      const x = (rng() - 0.5) * 31, z = (rng() - 0.5) * 24 - 3;
      if (CLEARINGS.some(([cx, cz]) => Math.hypot((x - cx) / 1.2, z - cz) < 2.75) || (x > 4.5 && x < 10 && z > -5 && z < 0)) continue;
      const height = 0.1 + rng() * 0.27;
      blades.push({ position: [x, height / 2, z], scale: [0.025 + rng() * 0.02, height, 0.016], rotation: [(rng() - 0.5) * 0.4, rng() * 6, (rng() - 0.5) * 0.6], color: ["#759049", "#90a45b", "#a6b576", "#6e8645"][i % 4] });
      if (i % 5 === 0) {
        const h = 0.17 + rng() * 0.28, r = 0.055 + rng() * 0.035;
        foliage.push({ position: [x, h / 2, z], scale: [0.014, h, 0.014], color: "#6c8b48" });
        foliage.push({ position: [x + 0.045, h * 0.5, z], scale: [0.08, 0.025, 0.04], rotation: [0, 0, 0.4], color: "#7b9952" });
        for (let p = 0; p < 5; p++) {
          const a = p * Math.PI * 0.4;
          blossoms.push({ position: [x + Math.cos(a) * r, h + 0.02, z + Math.sin(a) * r], scale: [r * 0.85, 0.022, r * 0.85], color: FLOWERS[i % FLOWERS.length] });
        }
        blossoms.push({ position: [x, h + 0.035, z], scale: [r * 0.5, 0.027, r * 0.5], color: "#e1ab4d" });
      }
      if (i % 29 === 0) stones.push({ position: [x, 0.04, z], scale: [0.12 + rng() * 0.15, 0.075, 0.11 + rng() * 0.15], rotation: [0, rng() * 6, 0], color: i % 2 ? "#bcb296" : "#a29e81" });
    }
    for (let i = 0; i < 30; i++) {
      const x = i < 15 ? -10 + rng() * 3 : 9 + rng() * 3, z = -5 + rng() * 7;
      foliage.push({ position: [x, 0.12, z], scale: [0.025, 0.22, 0.025], color: "#f0dfbb" });
      mushrooms.push({ position: [x, 0.23, z], scale: [0.12, 0.08, 0.12], color: i % 2 ? "#ce8b61" : "#e2b681" });
    }
    return { blades, foliage, blossoms, stones, mushrooms };
  }, []);
  return <>
    <group><Instances entries={blades} shape="sphere" shadows={false} /><Instances entries={foliage} shadows={false} /><Instances entries={blossoms} shadows={false} /><Instances entries={stones} /><Instances entries={mushrooms} /></group>
  </>;
}

function Cottage() {
  const roof = useMemo(() => new LatheGeometry([new Vector2(0, 4.3), new Vector2(0.2, 4.34), new Vector2(0.6, 4.18), new Vector2(1.1, 3.8), new Vector2(1.55, 3.35), new Vector2(1.87, 2.95), new Vector2(2.22, 2.78), new Vector2(2.23, 2.66)], 48), []);
  const shingles = useMemo(() => {
    const entries: Instance[] = [], rng = seeded(92);
    for (let row = 0; row < 6; row++) {
      const y = 2.81 + row * 0.23, radius = 2.05 - row * 0.235, n = Math.round(radius * 15);
      for (let i = 0; i < n; i++) {
        const a = (i + row * 0.5) / n * Math.PI * 2;
        entries.push({ position: [Math.sin(a) * radius, y, Math.cos(a) * radius], scale: [0.43, 0.105, 0.43], rotation: [0.72, a, 0], order: "YXZ", color: ["#b97b60", "#bf8164", "#c58768", "#b8795f"][Math.floor(rng() * 4)] });
      }
    }
    return entries;
  }, []);
  const door = useMemo(() => { const s = new Shape(); s.moveTo(-0.42, 0); s.lineTo(-0.42, 1.18); s.absarc(0, 1.18, 0.42, Math.PI, 0, true); s.lineTo(0.42, 0); s.closePath(); return new ShapeGeometry(s); }, []);
  return <group position={[-6.8, 0, -6.2]} rotation={[0, 0.2, 0]}>
    <Beam position={[0, 1.3, 0]} scale={[1.65, 2.6, 1.45]} color="#f1ddb7" />
    <Beam position={[0, 0.12, 0]} scale={[1.76, 0.24, 1.55]} color="#b1a486" />
    <mesh geometry={roof} material={material("#bb7758")} castShadow receiveShadow />
    <Instances entries={shingles} shape="tile" roughness={0.78} />
    <Beam position={[0, 2.55, 0]} scale={[1.7, 0.16, 1.5]} color="#9a7954" />
    <mesh geometry={door} position={[0, 0.13, 1.46]} material={material("#7f9879")} castShadow />
    {[-0.28, -0.14, 0, 0.14, 0.28].map(x => <Block key={x} position={[x, 0.75, 1.48]} scale={[0.012, 1.1, 0.01]} color="#657e60" />)}
    <E position={[0.25, 0.87, 1.5]} scale={[0.045, 0.045, 0.035]} color="#d5ab5e" roughness={0.3} />
    <Block position={[0, 0.09, 1.7]} scale={[1.2, 0.18, 0.55]} color="#c2b598" />
    {[-1, 1].map(side => <group key={side} position={[side * 1.02, 1.55, 1.16]} rotation={[0, side * 0.5, 0]}>
      <mesh material={material("#c18e5e")}><torusGeometry args={[0.35, 0.045, 8, 36]} /></mesh>
      <mesh position={[0, 0, 0.025]}><circleGeometry args={[0.31, 32]} /><meshStandardMaterial color="#ffe4a0" emissive="#ffc567" emissiveIntensity={0.35} roughness={0.25} /></mesh>
      <Block position={[0, 0, 0.04]} scale={[0.04, 0.62, 0.05]} color="#ac8357" /><Block position={[0, 0, 0.04]} scale={[0.62, 0.04, 0.05]} color="#ac8357" />
      <Block position={[0, -0.42, 0.1]} scale={[0.9, 0.18, 0.25]} color="#a27650" />
      {[-0.3, -0.1, 0.1, 0.3].map((x, i) => <group key={x}><E position={[x, -0.28, 0.13]} scale={[0.15, 0.12, 0.13]} color="#78985e" /><E position={[x, -0.2, 0.17]} scale={[0.075, 0.055, 0.07]} color={FLOWERS[i]} /></group>)}
    </group>)}
    <Block position={[0.9, 3.7, -0.25]} scale={[0.42, 1.15, 0.43]} color="#ab8162" />
    <Block position={[0.9, 4.3, -0.25]} scale={[0.54, 0.18, 0.54]} color="#87684e" />
    {[0, 1, 2].map(i => <Block key={i} position={[0.9, 3.5 + i * 0.25, -0.02]} scale={[0.44, 0.022, 0.015]} color="#d4b58f" />)}
    <Smoke />
    <group position={[1.2, 0.38, 1.2]}><Beam scale={[0.23, 0.5, 0.23]} color="#b77e59" /><E position={[0, 0.4, 0]} scale={[0.3, 0.34, 0.27]} color="#708e51" /><E position={[0.05, 0.6, 0.03]} scale={[0.1, 0.08, 0.1]} color="#e6bf7a" /></group>
    <group position={[-1.85, 0, 0.4]}><Beam position={[0, 0.55, 0]} scale={[0.055, 1.1, 0.055]} color="#977551" /><Block position={[0, 0.97, 0]} scale={[0.42, 0.3, 0.25]} color="#8da087" /><Block position={[0, 1.16, 0]} scale={[0.49, 0.09, 0.34]} color="#c38c63" /></group>
  </group>;
}
function Smoke() {
  const root = useRef<Group>(null);
  useFrame(({ clock }) => {
    root.current?.children.forEach((child, i) => {
      const phase = (clock.elapsedTime * 0.16 + i / 4) % 1;
      child.position.set(0.9 + phase * 0.5, 4.4 + phase * 1.7, -0.25);
      child.scale.setScalar(0.12 + phase * 0.4);
      ((child as Mesh).material as MeshStandardMaterial).opacity = (1 - phase) * 0.28;
    });
  });
  return <group ref={root}>{[0, 1, 2, 3].map(i => <mesh key={i} geometry={sphere}><meshStandardMaterial color="#f6edda" transparent opacity={0.2} depthWrite={false} /></mesh>)}</group>;
}

function Fence({ position, length = 8, angle = 0 }: { position: Vec3; length?: number; angle?: number }) {
  return <group position={position} rotation={[0, angle, 0]}>
    {[0.35, 0.7].map(y => <Block key={y} position={[length / 2, y, 0]} scale={[length, 0.09, 0.1]} color="#d4c2a0" />)}
    {Array.from({ length: Math.floor(length / 0.55) + 1 }, (_, i) => <group key={i} position={[i * 0.55, 0, 0]}>
      <Block position={[0, 0.48, 0]} scale={[0.16, 0.9, 0.14]} color="#e6d6b5" />
      <mesh position={[0, 0.97, 0]} rotation={[0, Math.PI / 4, 0]} material={material("#e6d6b5")} castShadow><coneGeometry args={[0.113, 0.15, 4]} /></mesh>
    </group>)}
  </group>;
}

function Pond() {
  const ripples = useRef<Group>(null);
  const shape = useMemo(() => {
    const shape = new Shape();
    for (let i = 0; i <= 70; i++) { const a = i / 70 * Math.PI * 2, r = 1 + Math.sin(a * 3) * 0.12 + Math.cos(a * 5) * 0.07; const x = Math.cos(a) * r * 2.8, y = Math.sin(a) * r * 1.75; if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y); }
    shape.closePath(); return new ShapeGeometry(shape, 50);
  }, []);
  const edging = useMemo(() => {
    const rng = seeded(61), result: Instance[] = [];
    for (let i = 0; i < 56; i++) { const a = i / 56 * Math.PI * 2, r = 1.02 + Math.sin(a * 3) * 0.12 + Math.cos(a * 5) * 0.07;
      result.push({ position: [Math.cos(a) * r * 2.8, 0.055, Math.sin(a) * r * 1.75], scale: [0.17 + rng() * 0.13, 0.11 + rng() * 0.1, 0.14 + rng() * 0.1], rotation: [0, rng() * 6, 0], color: i % 3 ? "#b7af90" : "#cfc4a7" }); }
    return result;
  }, []);
  useFrame(({ clock }) => { ripples.current?.children.forEach((mesh, i) => { const t = (clock.elapsedTime * 0.13 + i / 3) % 1; mesh.scale.setScalar(0.25 + t * 0.8); ((mesh as Mesh).material as MeshStandardMaterial).opacity = Math.sin(t * Math.PI) * 0.22; }); });
  return <group position={[7.8, 0, -2.6]}>
    <mesh geometry={shape} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.018, 0]} receiveShadow><meshPhysicalMaterial color="#60b8b0" roughness={0.24} metalness={0.08} clearcoat={1} clearcoatRoughness={0.24} /></mesh>
    <Instances entries={edging} />
    <group ref={ripples} position={[0.3, 0.035, 0]} rotation={[-Math.PI / 2, 0, 0]}>{[0, 1, 2].map(i => <mesh key={i}><ringGeometry args={[0.95, 0.965, 64]} /><meshStandardMaterial color="#e3f0d8" transparent opacity={0.2} depthWrite={false} side={DoubleSide} /></mesh>)}</group>
    {[[-1.3, -0.5], [0.9, 0.5], [1.2, -0.7]].map(([x, z], i) => <group key={i} position={[x, 0.04, z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[0.3, 24, 0.15, Math.PI * 1.85]} /><meshStandardMaterial color="#74986a" roughness={0.7} side={DoubleSide} /></mesh>
      {i === 0 && <><E position={[0.05, 0.07, 0]} scale={[0.1, 0.065, 0.1]} color="#edd9be" /><E position={[0.05, 0.1, 0]} scale={[0.05, 0.05, 0.05]} color="#efbd73" /></>}
    </group>)}
    {[-1, 1].map(side => <group key={side} position={[side * 2.25, 0, -1]}>{[0, 1, 2, 3].map(i => <group key={i} position={[i * 0.13, 0, Math.sin(i) * 0.1]}><Beam position={[0, 0.5 + i * 0.05, 0]} scale={[0.015, 1 + i * 0.1, 0.015]} rotation={[0, 0, side * 0.06]} color="#6d8550" /><E position={[side * 0.03, 0.98 + i * 0.1, 0]} scale={[0.055, 0.17, 0.055]} color="#94704e" /></group>)}</group>)}
    <group position={[-0.2, 0.12, 1.5]} rotation={[0, -0.18, 0]}>
      {Array.from({ length: 14 }, (_, i) => <Block key={i} position={[(i - 6.5) * 0.22, Math.sin(i / 13 * Math.PI) * 0.24, 0]} scale={[0.21, 0.12, 0.9]} color={i % 2 ? "#bb9468" : "#c9a578"} />)}
      {[-1, 1].map(side => <group key={side}>{[-1.4, 0, 1.4].map(x => <Beam key={x} position={[x, 0.45 + (x === 0 ? 0.24 : 0), side * 0.47]} scale={[0.04, 0.85, 0.04]} color="#a48158" />)}<Beam position={[0, 0.8, side * 0.47]} scale={[0.045, 2.85, 0.045]} rotation={[0, 0, Math.PI / 2]} color="#a48158" /></group>)}
    </group>
  </group>;
}

function Garden() {
  return <group position={[-8, 0, 0.8]} rotation={[0, 0.18, 0]}>
    {[0, -2.1].map((z, row) => <group key={z} position={[0, 0, z]}>
      <Block position={[0, 0.1, 0]} scale={[2.4, 0.2, 1.3]} color="#806747" />
      {[-1, 1].map(side => <Block key={side} position={[side * 1.2, 0.22, 0]} scale={[0.09, 0.25, 1.4]} color="#b89769" />)}
      {[-1, 1].map(side => <Block key={side} position={[0, 0.22, side * 0.67]} scale={[2.5, 0.25, 0.09]} color="#c4a074" />)}
      {[-0.85, -0.3, 0.3, 0.85].map((x, i) => <group key={x} position={[x, 0.2, 0]}>
        <Beam position={[0, 0.34, 0]} scale={[0.018, 0.65, 0.018]} color="#718c4d" />
        {[-1, 1].map(side => <E key={side} position={[side * 0.09, 0.22, 0]} scale={[0.14, 0.055, 0.065]} rotation={[0, 0, side * 0.45]} color="#829a53" />)}
        {row === 0 ? <><E position={[0, 0.67, 0]} scale={[0.12, 0.11, 0.1]} color={FLOWERS[i]} />{Array.from({ length: 5 }, (_, p) => <E key={p} position={[Math.sin(p * 1.256) * 0.14, 0.67 + Math.cos(p * 1.256) * 0.14, 0.01]} scale={[0.12, 0.1, 0.06]} color={FLOWERS[i]} />)}<E position={[0, 0.67, 0.07]} scale={[0.07, 0.07, 0.04]} color="#c99b44" /></> : <><E position={[0, 0.17, 0]} scale={[0.22, 0.16, 0.2]} color="#93a764" /><E position={[0.06, 0.25, 0]} scale={[0.15, 0.13, 0.14]} color="#b1ba77" /></>}
      </group>)}
    </group>)}
    <group position={[1.7, 0.3, 0.5]} rotation={[0, -0.6, 0]}><Beam scale={[0.23, 0.38, 0.23]} color="#83a5a0" /><Beam position={[0.31, 0.12, 0]} scale={[0.05, 0.55, 0.05]} rotation={[0, 0, -0.8]} color="#83a5a0" /><mesh position={[-0.2, 0.06, 0]} material={material("#83a5a0")}><torusGeometry args={[0.18, 0.03, 8, 24]} /></mesh></group>
  </group>;
}

function Picnic() {
  return <group position={[1.4, 0, -4.2]} rotation={[0, -0.17, 0]}>
    <Block position={[0, 0.025, 0]} scale={[2.4, 0.025, 1.55]} color="#ede0c0" />
    {[-1, -0.5, 0, 0.5, 1].map(x => <Block key={x} position={[x, 0.043, 0]} scale={[0.06, 0.01, 1.5]} color="#c7ad8b" />)}
    {[-0.6, -0.1, 0.4].map(z => <Block key={z} position={[0, 0.044, z]} scale={[2.4, 0.01, 0.06]} color="#c7ad8b" />)}
    <group position={[0.5, 0.2, -0.3]}><Block scale={[0.55, 0.33, 0.37]} color="#bb9668" />{[-0.2, -0.1, 0, 0.1, 0.2].map(x => <Block key={x} position={[x, 0, 0.19]} scale={[0.018, 0.33, 0.015]} color="#e0c29a" />)}<mesh position={[0, 0.22, 0]} material={material("#b48f63")}><torusGeometry args={[0.24, 0.025, 8, 24, Math.PI]} /></mesh></group>
    <E position={[-0.5, 0.12, 0.2]} scale={[0.22, 0.07, 0.22]} color="#eee7cc" /><E position={[-0.5, 0.21, 0.2]} scale={[0.11, 0.12, 0.11]} color="#cb8063" />
    <group position={[-0.8, 0.13, -0.25]}><Block scale={[0.45, 0.16, 0.34]} color="#8da7a5" /><Block position={[0, 0.01, 0.01]} scale={[0.42, 0.1, 0.34]} color="#eee1c2" /></group>
  </group>;
}

function Butterflies({ reducedMotion }: { reducedMotion: boolean }) {
  const root = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (reducedMotion) return;
    root.current?.children.forEach((child, i) => {
      const t = clock.elapsedTime * 0.4 + i * 2;
      child.position.set(Math.sin(t * 0.7) * 6 + (i === 0 ? -3 : 2), 1.7 + Math.sin(t * 1.7) * 0.6, -2 + Math.cos(t) * 4);
      child.rotation.y = t;
      child.children.forEach((wing, j) => { wing.rotation.z = (j % 2 ? -1 : 1) * (0.3 + Math.sin(clock.elapsedTime * 12 + i) * 0.7); });
    });
  });
  return <group ref={root}>{[0, 1, 2].map(i => <group key={i}>{[-1, 1].map(side => <group key={side}><E position={[side * 0.09, 0, 0]} scale={[0.11, 0.018, 0.095]} color={i === 1 ? "#edc884" : "#e8c5b6"} shadow={false} /><E position={[side * 0.06, 0, -0.09]} scale={[0.065, 0.015, 0.055]} color={i === 1 ? "#ddb268" : "#dba998"} shadow={false} /></group>)}</group>)}</group>;
}

function Sky() {
  const clouds = useMemo(() => {
    const rng = seeded(81), entries: Instance[] = [];
    for (let i = 0; i < 15; i++) {
      const x = (rng() - 0.5) * 100, y = 17 + rng() * 9, z = -42 - rng() * 20;
      for (let j = 0; j < 4; j++) entries.push({ position: [x + j * 2.3, y + Math.sin(j) * 0.7, z], scale: [3.1, 1.15 + rng(), 1.6], color: "#fff0d5" });
    }
    return entries;
  }, []);
  return <Instances entries={clouds} shadows={false} />;
}

export function Environment({ reducedMotion = false }: { reducedMotion?: boolean }) {
  return <>
    <Ground /><Sky /><Forest /><Cottage /><Pond /><Garden /><Picnic /><Wildflowers />
    <Fence position={[-10.7, 0, -4.5]} length={2.3} angle={0.12} />
    <Fence position={[-5, 0, -8.5]} length={8.4} angle={0.03} />
    <Fence position={[10.8, 0, -6.5]} length={6} angle={-0.65} />
    <Butterflies reducedMotion={reducedMotion} />
    <group position={[3.8, 0, -5.9]} rotation={[0, -0.25, 0]}>
      <Block position={[0, 0.5, 0]} scale={[1.65, 0.12, 0.52]} color="#ba9468" />
      <Block position={[0, 0.91, -0.2]} scale={[1.65, 0.4, 0.1]} color="#c4a174" />
      {[-0.65, 0.65].map(x => <Block key={x} position={[x, 0.28, 0]} scale={[0.12, 0.5, 0.48]} color="#96734e" />)}
    </group>
    <group position={[0, 0, -5.7]}>
      {[-1, 1].map(side => <Beam key={side} position={[side * 1.4, 1.25, 0]} scale={[0.08, 2.5, 0.08]} color="#a58a5f" />)}
      <Beam position={[0, 2.5, 0]} scale={[0.065, 3.1, 0.065]} rotation={[0, 0, Math.PI / 2]} color="#a58a5f" />
      {[-1.15, -0.75, -0.35, 0.05, 0.45, 0.85, 1.25].map((x, i) => <mesh key={i} position={[x, 2.27 - Math.cos(x) * 0.08, 0]} rotation={[0, 0, Math.PI]} material={material(["#deab89", "#d1bc82", "#a3b3a0", "#cfb8bf"][i % 4])}><coneGeometry args={[0.15, 0.3, 3]} /></mesh>)}
    </group>
  </>;
}
