"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { MathUtils } from "three";
import type { Group, Mesh } from "three";
import type { DialogueLine, Speaker } from "@/lib/kay/types";
import { Ellipsoid as E, Beam, material, sphere } from "./primitives";
import type { Vec3 } from "./primitives";

export type Actor = Exclude<Speaker, "narrator">;
export const ACTOR_POSITIONS: Record<Actor, Vec3> = {
  kimi: [-1.45, 0, 0.25], momo: [1.3, 0, 0], bori: [0.05, 0, -1.5], owl: [-2.7, 0, -2.3],
};
export const HEADS: Record<Actor, number> = { kimi: 1.68, momo: 1.52, bori: 1.12, owl: 1.55 };
const CHARACTER = {
  kimi: { fur: "#fff0d5", light: "#fff8e8", accent: "#e6a18a", head: [0.52, 0.55, 0.47], body: [0.37, 0.54, 0.3], height: 1.68, bodyY: 0.83, eye: 0.195 },
  momo: { fur: "#ba815b", light: "#f4d9b0", accent: "#80b8c8", head: [0.56, 0.53, 0.49], body: [0.43, 0.52, 0.33], height: 1.5, bodyY: 0.75, eye: 0.205 },
  bori: { fur: "#efd2a0", light: "#fff0d2", accent: "#dfb250", head: [0.48, 0.43, 0.45], body: [0.34, 0.39, 0.29], height: 1.15, bodyY: 0.58, eye: 0.175 },
  owl: { fur: "#9c8574", light: "#eddbc3", accent: "#b3a4ca", head: [0.57, 0.49, 0.4], body: [0.47, 0.58, 0.34], height: 1.48, bodyY: 0.78, eye: 0.23 },
} as const;

/** Soft sculpted versions of the original cast, with real animated faces and articulated gestures. */
export function Character({ id, line, playing, reducedMotion = false }: {
  id: Actor; line: DialogueLine | null; playing: boolean; reducedMotion?: boolean;
}) {
  const root = useRef<Group>(null), head = useRef<Group>(null), eyes = useRef<Group>(null);
  const mouth = useRef<Mesh>(null), browL = useRef<Group>(null), browR = useRef<Group>(null);
  const leftArm = useRef<Group>(null), rightArm = useRef<Group>(null);
  const leftLeg = useRef<Group>(null), rightLeg = useRef<Group>(null);
  const ears = useRef<Group>(null), tail = useRef<Group>(null);
  const localTime = useRef(0), previousLine = useRef("");
  const base = ACTOR_POSITIONS[id], c = CHARACTER[id];
  const index = Object.keys(ACTOR_POSITIONS).indexOf(id);
  const isCurrentSpeaker = line?.speaker === id;
  const speaking = isCurrentSpeaker && playing;
  const addressed = line?.to === id;
  const mood = line?.speaker === id ? line.emotion ?? "happy" : addressed ? "curious" : "happy";
  const motion = speaking ? line?.action ?? "talk" : "talk";

  useFrame(({ clock }, delta) => {
    if (!root.current || !head.current) return;
    if (previousLine.current !== line?.id) { localTime.current = 0; previousLine.current = line?.id ?? ""; }
    localTime.current += delta;
    const t = clock.elapsedTime + index * 1.71;
    const time = localTime.current;
    const dance = speaking && (motion === "dance" || motion === "cheer");
    const walk = speaking && motion === "walk";
    const bounce = reducedMotion ? 0 : dance ? Math.abs(Math.sin(t * 5.5)) * 0.15 : walk ? Math.abs(Math.sin(t * 8)) * 0.045 : Math.sin(t * 1.8) * 0.014;
    root.current.position.set(base[0] + (walk ? Math.sin(Math.min(time, 3) * 0.6) * 0.45 : 0), bounce, base[2]);
    const other = line?.to && line.to !== "narrator" ? ACTOR_POSITIONS[line.to] : null;
    const source = line?.speaker && line.speaker !== "narrator" ? ACTOR_POSITIONS[line.speaker] : null;
    // Most of the face stays visible; turns toward a friend never hide the speaking face.
    let yaw = id === "kimi" ? 0.2 : id === "momo" ? -0.28 : 0.05;
    if (isCurrentSpeaker && other) yaw = MathUtils.clamp((other[0] - base[0]) * 0.17, -0.52, 0.52);
    else if (source && !isCurrentSpeaker) yaw = MathUtils.clamp((source[0] - base[0]) * 0.16, -0.56, 0.56);
    const gazeTarget = isCurrentSpeaker ? other : source;
    const gaze = gazeTarget ? MathUtils.clamp((gazeTarget[0] - base[0]) * 0.055, -0.11, 0.11) : 0;
    head.current.rotation.y = MathUtils.damp(head.current.rotation.y, gaze, 5, delta);
    root.current.rotation.y = MathUtils.damp(root.current.rotation.y, yaw + (dance ? Math.sin(t * 3) * 0.28 : 0), 4, delta);
    root.current.rotation.z = reducedMotion ? 0 : dance ? Math.sin(t * 4) * 0.07 : 0;
    head.current.rotation.z = MathUtils.damp(head.current.rotation.z, mood === "curious" ? -0.09 : mood === "sad" ? 0.08 : speaking ? Math.sin(t * 2.9) * 0.035 : Math.sin(t * 1.1) * 0.018, 6, delta);
    head.current.rotation.x = MathUtils.damp(head.current.rotation.x, mood === "sad" ? 0.13 : speaking ? Math.sin(t * 4.1) * 0.025 : addressed ? Math.sin(t * 2) * 0.04 : 0, 5, delta);
    const blink = Math.sin(t * 1.23) > 0.992 || Math.sin(t * 0.79 + 2) > 0.997;
    if (eyes.current) {
      eyes.current.scale.y = MathUtils.damp(eyes.current.scale.y, blink ? 0.06 : mood === "excited" ? 1.1 : 1, 28, delta);
      eyes.current.position.x = MathUtils.damp(eyes.current.position.x, gaze * 0.19, 5, delta);
    }
    if (mouth.current) {
      const opening = speaking ? 0.025 + (Math.sin(t * 19) + Math.sin(t * 31) * 0.3 + 1.3) * 0.021 : mood === "surprised" ? 0.065 : 0.016;
      mouth.current.scale.y = MathUtils.damp(mouth.current.scale.y, opening, 22, delta);
      mouth.current.scale.x = mood === "surprised" ? 0.052 : speaking ? 0.068 : 0.055;
    }
    if (browL.current && browR.current) {
      const angle = mood === "sad" ? -0.3 : mood === "curious" ? 0.12 : 0;
      browL.current.rotation.z = angle;
      browR.current.rotation.z = -angle;
      browL.current.position.y = mood === "surprised" ? 0.265 : 0.225;
      browR.current.position.y = mood === "surprised" ? 0.265 : 0.225;
    }
    if (leftArm.current && rightArm.current) {
      const gesticulate = speaking && !reducedMotion ? Math.sin(t * 3.2) : 0;
      const raised = dance ? 2.4 : speaking && motion === "wave" ? 2.25 : speaking && motion === "offer" ? 1 : 0.12;
      leftArm.current.rotation.z = MathUtils.damp(leftArm.current.rotation.z, dance ? -2.4 : -0.12 - Math.max(0, gesticulate) * 0.27, 7, delta);
      rightArm.current.rotation.z = MathUtils.damp(rightArm.current.rotation.z, raised + (motion === "wave" && speaking ? Math.sin(t * 8) * 0.23 : Math.max(0, -gesticulate) * 0.4), 7, delta);
      leftArm.current.rotation.x = walk ? Math.sin(t * 8) * 0.45 : 0;
      rightArm.current.rotation.x = walk ? -Math.sin(t * 8) * 0.45 : motion === "offer" && speaking ? -0.7 : motion === "think" && speaking ? -1.2 : 0;
    }
    if (leftLeg.current && rightLeg.current) {
      leftLeg.current.rotation.x = walk ? Math.sin(t * 8) * 0.5 : dance ? Math.sin(t * 5.5) * 0.24 : 0;
      rightLeg.current.rotation.x = -leftLeg.current.rotation.x;
    }
    if (ears.current && !reducedMotion) ears.current.rotation.z = Math.sin(t * 1.5) * 0.025 + (dance ? Math.sin(t * 5) * 0.07 : 0);
    if (tail.current && !reducedMotion) tail.current.rotation.y = Math.sin(t * (speaking ? 8 : 4)) * 0.35;
  });

  const faceZ = id === "owl" ? 0.46 : c.head[2] * 0.91;
  return <group ref={root} position={base}>
    <E position={[0, c.bodyY, 0]} scale={[...c.body]} color={c.fur} />
    <E position={[0, c.bodyY - 0.04, c.body[2] * 0.7]} scale={[c.body[0] * 0.7, c.body[1] * 0.69, 0.12]} color={c.light} />
    {[-1, 1].map(side => <group key={side} ref={side < 0 ? leftLeg : rightLeg} position={[side * (id === "owl" ? 0.2 : 0.19), 0.34, 0]}>
      <E position={[0, -0.11, 0.07]} scale={id === "owl" ? [0.16, 0.12, 0.23] : [0.16, 0.21, 0.22]} color={id === "owl" ? "#d7a45b" : c.fur} />
      <E position={[0, -0.16, 0.2]} scale={[0.11, 0.045, 0.055]} color={id === "kimi" ? "#eac6b4" : c.light} />
    </group>)}
    {[-1, 1].map(side => <group key={side} ref={side < 0 ? leftArm : rightArm} position={[side * c.body[0] * 0.88, c.bodyY + 0.2, 0]}>
      <E position={[side * 0.07, -0.22, 0]} scale={id === "owl" ? [0.2, 0.35, 0.12] : [0.125, 0.3, 0.14]} rotation={[0, 0, side * 0.12]} color={c.fur} />
      {id !== "owl" && <E position={[side * 0.07, -0.42, 0.025]} scale={[0.13, 0.15, 0.145]} color={c.fur} />}
      {id === "owl" && [-0.1, 0, 0.1].map((x, i) => <E key={i} position={[x, -0.36, 0.02]} scale={[0.06, 0.16, 0.09]} color={i % 2 ? "#8c776c" : "#b59b7f"} />)}
    </group>)}
    {id !== "owl" && <group ref={tail} position={[0, c.bodyY - 0.13, -c.body[2]]}>
      <E position={id === "bori" ? [0.12, 0.1, -0.1] : [0, 0, -0.04]} scale={id === "bori" ? [0.1, 0.26, 0.1] : [0.15, 0.16, 0.15]} rotation={id === "bori" ? [-0.65, 0, -0.3] : undefined} color={id === "kimi" ? c.light : c.fur} />
    </group>}
    {/* A real wrapped scarf, knot and softly hanging ends. */}
    <group position={[0, c.height - c.head[1] * 0.72, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={material(c.accent)} castShadow><torusGeometry args={[c.body[0] * 0.83, 0.085, 10, 30]} /></mesh>
      <E position={[0.19, -0.1, 0.27]} scale={[0.12, 0.14, 0.1]} color={c.accent} />
      <E position={[0.23, -0.32, 0.29]} scale={[0.115, 0.23, 0.045]} rotation={[0.12, 0, -0.2]} color={c.accent} />
      <E position={[0.09, -0.28, 0.3]} scale={[0.085, 0.17, 0.04]} rotation={[0, 0, 0.24]} color={c.accent} />
      {id === "bori" && <E position={[-0.06, -0.15, 0.3]} scale={[0.075, 0.075, 0.025]} color="#f5d47e" roughness={0.35} />}
    </group>
    <group ref={head} position={[0, c.height, 0]}>
      <E scale={[...c.head]} color={c.fur} />
      <group ref={ears}>
        {id === "kimi" && [-1, 1].map(side => <group key={side} position={[side * 0.245, 0.43, -0.035]} rotation={[0.03, 0, side * -0.13]}>
          <E position={[0, 0.43, 0]} scale={[0.165, 0.63, 0.13]} color={c.fur} />
          <E position={[0, 0.46, 0.09]} scale={[0.088, 0.48, 0.045]} color="#edb7aa" />
        </group>)}
        {id === "momo" && [-1, 1].map(side => <group key={side} position={[side * 0.43, 0.4, -0.07]}>
          <E scale={[0.225, 0.23, 0.15]} color={c.fur} /><E position={[0, 0, 0.11]} scale={[0.135, 0.145, 0.05]} color="#d6a37c" />
        </group>)}
        {id === "bori" && [-1, 1].map(side => <group key={side} position={[side * 0.43, 0.13, -0.03]} rotation={[0.04, 0, side * 0.14]}>
          <E position={[0, -0.13, 0]} scale={[0.16, 0.41, 0.16]} color="#c29465" />
          <E position={[0, -0.2, 0.13]} scale={[0.085, 0.22, 0.04]} color="#d8ab84" />
        </group>)}
        {id === "owl" && [-1, 1].map(side => <E key={side} position={[side * 0.35, 0.4, -0.06]} scale={[0.17, 0.27, 0.13]} rotation={[0, 0, side * -0.3]} color={c.fur} />)}
      </group>
      {id === "owl" && [-1, 1].map(side => <E key={side} position={[side * 0.22, 0.035, 0.31]} scale={[0.28, 0.31, 0.12]} color={c.light} />)}
      {(id === "momo" || id === "bori") && <E position={[0, -0.17, faceZ - 0.015]} scale={[0.28, 0.21, 0.12]} color={c.light} />}
      <group ref={eyes} position={[0, 0.04, 0]}>
        {[-1, 1].map(side => <group key={side} position={[side * c.eye, 0, faceZ]}>
          <E scale={[0.096, 0.122, 0.063]} color="#39291f" roughness={0.16} shadow={false} />
          <E position={[-0.027, 0.042, 0.052]} scale={[0.032, 0.035, 0.014]} color="#fffbed" roughness={0.08} shadow={false} />
          <E position={[0.033, -0.039, 0.053]} scale={[0.012, 0.012, 0.009]} color="#c99560" roughness={0.12} shadow={false} />
        </group>)}
      </group>
      {[-1, 1].map(side => <group key={side} ref={side < 0 ? browL : browR} position={[side * c.eye, 0.225, faceZ - 0.03]}>
        <E scale={[0.075, 0.018, 0.018]} rotation={[0, 0, side * -0.08]} color={id === "kimi" ? "#cbb08f" : "#7a5541"} shadow={false} />
      </group>)}
      {[-1, 1].map(side => <E key={side} position={[side * (c.eye + 0.12), -0.135, faceZ - 0.025]} scale={[0.095, 0.055, 0.022]} color={id === "momo" ? "#d59a83" : "#edb0a3"} shadow={false} />)}
      {id === "owl" ? <E position={[0, -0.12, faceZ + 0.12]} scale={[0.083, 0.12, 0.12]} color="#dba552" /> : <E position={[0, -0.12, faceZ + (id === "kimi" ? 0.04 : 0.1)]} scale={[id === "bori" ? 0.1 : 0.065, 0.047, 0.055]} color={id === "kimi" ? "#d89890" : "#604232"} roughness={0.4} />}
      <mesh ref={mouth} position={[0, -0.245, faceZ + (id === "momo" || id === "bori" ? 0.085 : -0.002)]} geometry={sphere} material={material("#784b40", 0.6)} scale={[0.055, 0.016, 0.018]} />
      {id === "owl" && [-1, 1].map(side => <group key={side} position={[side * c.eye, 0.04, faceZ + 0.08]}>
        <mesh material={material("#b28c54", 0.38, 0.35)}><torusGeometry args={[0.145, 0.013, 8, 28]} /></mesh>
      </group>)}
      {id === "owl" && <Beam position={[0, 0.05, faceZ + 0.08]} scale={[0.01, 0.18, 0.01]} rotation={[0, 0, Math.PI / 2]} color="#b28c54" />}
    </group>
  </group>;
}
