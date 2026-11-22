"use client";

import { useFrame } from "@react-three/fiber";
import { useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { MathUtils } from "three";
import type { Group, Mesh, Object3D } from "three";
import { Character, Puppet } from "@/components/harbir/three/characters";
import type { Build, Rig } from "@/components/harbir/three/characters";
import { Beam, Ellipsoid as E, material, sphere } from "@/components/kay/three/primitives";
import type { Vec3 } from "@/components/kay/three/primitives";
import type { SceneLine } from "@/app/api/scene/contract";
import type { Sim } from "@/lib/harbir/sim";
import type { ActorId, Emotion } from "@/lib/world";

type Kind = "alice" | "momo" | "bori" | "owl";

/**
 * Kay's sculpted cast, sized to Harbir's meadow. Scale shrinks Kay's stage-sized bodies to
 * the meadow's props; middle is where a scaled body turns during a somersault.
 */
const LOOKS = {
  hero: { kind: "alice", scale: 0.6, middle: 0.5, fur: "#fff0d5", light: "#fff8e8", accent: "#e6a18a", head: [0.52, 0.55, 0.47], body: [0.37, 0.54, 0.3], height: 1.68, bodyY: 0.83, eye: 0.195 },
  friend: { kind: "momo", scale: 0.62, middle: 0.47, fur: "#ba815b", light: "#f4d9b0", accent: "#80b8c8", head: [0.56, 0.53, 0.49], body: [0.43, 0.52, 0.33], height: 1.5, bodyY: 0.75, eye: 0.205 },
  puppy: { kind: "bori", scale: 0.62, middle: 0.36, fur: "#efd2a0", light: "#fff0d2", accent: "#dfb250", head: [0.48, 0.43, 0.45], body: [0.34, 0.39, 0.29], height: 1.15, bodyY: 0.58, eye: 0.175 },
  grownup: { kind: "owl", scale: 0.74, middle: 0.58, fur: "#9c8574", light: "#eddbc3", accent: "#b3a4ca", head: [0.57, 0.49, 0.4], body: [0.47, 0.58, 0.34], height: 1.48, bodyY: 0.78, eye: 0.23 },
} as const satisfies Record<string, { kind: Kind; scale: number; middle: number; head: Vec3; body: Vec3 } & Record<string, unknown>>;
type Look = (typeof LOOKS)[keyof typeof LOOKS];
type KayActor = keyof typeof LOOKS;
const isKayActor = (id: ActorId): id is KayActor => Object.hasOwn(LOOKS, id);

/** Height of each character's head above the ground, for framing close-ups. */
export const HEAD: Record<ActorId, number> = {
  hero: LOOKS.hero.height * LOOKS.hero.scale,
  friend: LOOKS.friend.height * LOOKS.friend.scale,
  puppy: LOOKS.puppy.height * LOOKS.puppy.scale,
  grownup: LOOKS.grownup.height * LOOKS.grownup.scale,
  kitten: 0.85,
  duck: 0.8,
};

/** What the dialogue box is doing, so faces can talk, listen, and react. */
export interface Talk {
  line: SceneLine | null;
  /** True while the line's audio is actually playing. */
  speaking: boolean;
  /** A point in the world the cast turns their heads toward while nobody is talking, such as the pointer. */
  watch?: { x: number; y: number; z: number } | null;
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function moodOf(id: ActorId, sim: Sim, { line }: Talk): Emotion {
  if (line?.speaker === id && line.emotion) return line.emotion;
  const actor = sim.actors[id];
  if (actor?.emotion) return actor.emotion;
  return line?.to === id ? "curious" : "happy";
}

/** Eyes, brows, mouth, and where the head looks. The body itself is posed by Puppet. */
function useFace(id: KayActor, sim: Sim, talk: Talk) {
  const look = useRef<Group>(null), eyes = useRef<Group>(null), mouth = useRef<Mesh>(null);
  const browL = useRef<Group>(null), browR = useRef<Group>(null);
  useFrame(({ clock }, elapsed) => {
    const actor = sim.actors[id];
    if (!actor || !look.current) return;
    const delta = Math.min(elapsed, 0.05);
    const t = clock.elapsedTime + Object.keys(LOOKS).indexOf(id) * 1.71;
    const { line } = talk;
    const talking = line?.speaker === id && talk.speaking;
    const mood = moodOf(id, sim, talk);
    const partner = line?.speaker === id ? line.to : line?.to === id ? line.speaker : undefined;
    const other = partner && sim.actors[partner];
    const target = other || (!line && talk.watch);
    const yaw = target ? MathUtils.clamp(wrapAngle(Math.atan2(target.x - actor.x, target.z - actor.z) - actor.heading), -0.7, 0.7) : 0;
    // Only a watched point has a height; partners are looked at level.
    const watching = !other && !line && talk.watch;
    const up = watching ? MathUtils.clamp(-Math.atan2(watching.y - HEAD[id], Math.hypot(watching.x - actor.x, watching.z - actor.z)), -0.35, 0.3) : 0;
    look.current.rotation.y = MathUtils.damp(look.current.rotation.y, yaw, 5, delta);
    const bob = talking ? Math.sin(t * 4.1) * 0.06 : 0;
    look.current.rotation.x = MathUtils.damp(look.current.rotation.x, (mood === "sad" ? 0.13 : 0) + bob + up, 6, delta);
    look.current.rotation.z = MathUtils.damp(look.current.rotation.z, mood === "curious" ? -0.1 : mood === "sad" ? 0.1 : talking ? Math.sin(t * 2.9) * 0.07 : 0, 6, delta);
    const blink = Math.sin(t * 1.23) > 0.992 || Math.sin(t * 0.79 + 2) > 0.997;
    if (eyes.current) eyes.current.scale.y = MathUtils.damp(eyes.current.scale.y, blink ? 0.06 : mood === "excited" ? 1.1 : 1, 28, delta);
    if (mouth.current) {
      const opening = talking ? 0.025 + (Math.sin(t * 19) + Math.sin(t * 31) * 0.3 + 1.3) * 0.021 : mood === "surprised" ? 0.065 : 0.016;
      mouth.current.scale.y = MathUtils.damp(mouth.current.scale.y, opening, 22, delta);
      mouth.current.scale.x = mood === "surprised" ? 0.052 : talking ? 0.068 : 0.055;
    }
    if (browL.current && browR.current) {
      const angle = mood === "sad" ? -0.3 : mood === "curious" ? 0.12 : 0;
      const height = mood === "surprised" ? 0.265 : 0.225;
      browL.current.rotation.z = angle;
      browR.current.rotation.z = -angle;
      browL.current.position.y = height;
      browR.current.position.y = height;
    }
  });
  return { look, eyes, mouth, browL, browR };
}

type SetLimb = (name: keyof Rig, limb: Object3D | null) => void;

function Limb({ rig, name, position, rotation, children }: { rig: SetLimb; name: keyof Rig; position: Vec3; rotation?: Vec3; children: ReactNode }) {
  return <group position={position} rotation={rotation} ref={(group) => rig(name, group)}>{children}</group>;
}

function KayBody({ id, build: c, sim, talk, rig }: { id: KayActor; build: Look; sim: Sim; talk: Talk; rig: SetLimb }) {
  const { look, eyes, mouth, browL, browR } = useFace(id, sim, talk);
  const kind = c.kind;
  const faceZ = kind === "owl" ? 0.46 : c.head[2] * 0.91;
  return <group scale={c.scale}>
    <E position={[0, c.bodyY, 0]} scale={[...c.body]} color={c.fur} />
    <E position={[0, c.bodyY - 0.04, c.body[2] * 0.7]} scale={[c.body[0] * 0.7, c.body[1] * 0.69, 0.12]} color={c.light} />
    {([-1, 1] as const).map((side) => <Limb key={side} rig={rig} name={side < 0 ? "leftLeg" : "rightLeg"} position={[side * (kind === "owl" ? 0.2 : 0.19), 0.34, 0]}>
      <E position={[0, -0.11, 0.07]} scale={kind === "owl" ? [0.16, 0.12, 0.23] : [0.16, 0.21, 0.22]} color={kind === "owl" ? "#d7a45b" : c.fur} />
      <E position={[0, -0.16, 0.2]} scale={[0.11, 0.045, 0.055]} color={kind === "alice" ? "#eac6b4" : c.light} />
    </Limb>)}
    {([-1, 1] as const).map((side) => <Limb key={side} rig={rig} name={side < 0 ? "leftArm" : "rightArm"} position={[side * c.body[0] * 0.88, c.bodyY + 0.2, 0]}>
      <E position={[side * 0.07, -0.22, 0]} scale={kind === "owl" ? [0.2, 0.35, 0.12] : [0.125, 0.3, 0.14]} rotation={[0, 0, side * 0.12]} color={c.fur} />
      {kind !== "owl" && <E position={[side * 0.07, -0.42, 0.025]} scale={[0.13, 0.15, 0.145]} color={c.fur} />}
      {kind === "owl" && [-0.1, 0, 0.1].map((x, i) => <E key={i} position={[x, -0.36, 0.02]} scale={[0.06, 0.16, 0.09]} color={i % 2 ? "#8c776c" : "#b59b7f"} />)}
    </Limb>)}
    {kind !== "owl" && <Limb rig={rig} name="tail" position={[0, c.bodyY - 0.13, -c.body[2]]}>
      <E position={kind === "bori" ? [0.12, 0.1, -0.1] : [0, 0, -0.04]} scale={kind === "bori" ? [0.1, 0.26, 0.1] : [0.15, 0.16, 0.15]} rotation={kind === "bori" ? [-0.65, 0, -0.3] : undefined} color={kind === "alice" ? c.light : c.fur} />
    </Limb>}
    <group position={[0, c.height - c.head[1] * 0.72, 0]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} material={material(c.accent)} castShadow><torusGeometry args={[c.body[0] * 0.83, 0.085, 10, 30]} /></mesh>
      <E position={[0.19, -0.1, 0.27]} scale={[0.12, 0.14, 0.1]} color={c.accent} />
      <E position={[0.23, -0.32, 0.29]} scale={[0.115, 0.23, 0.045]} rotation={[0.12, 0, -0.2]} color={c.accent} />
      <E position={[0.09, -0.28, 0.3]} scale={[0.085, 0.17, 0.04]} rotation={[0, 0, 0.24]} color={c.accent} />
      {kind === "bori" && <E position={[-0.06, -0.15, 0.3]} scale={[0.075, 0.075, 0.025]} color="#f5d47e" roughness={0.35} />}
    </group>
    <Limb rig={rig} name="head" position={[0, c.height, 0]}>
      <group ref={look}>
        <E scale={[...c.head]} color={c.fur} />
        {kind === "alice" && ([-1, 1] as const).map((side) => <Limb key={side} rig={rig} name={side < 0 ? "leftEar" : "rightEar"} position={[side * 0.245, 0.43, -0.035]}>
          <group rotation={[0.03, 0, side * -0.13]}>
            <E position={[0, 0.43, 0]} scale={[0.165, 0.63, 0.13]} color={c.fur} />
            <E position={[0, 0.46, 0.09]} scale={[0.088, 0.48, 0.045]} color="#edb7aa" />
          </group>
        </Limb>)}
        {kind === "momo" && [-1, 1].map((side) => <group key={side} position={[side * 0.43, 0.4, -0.07]}>
          <E scale={[0.225, 0.23, 0.15]} color={c.fur} /><E position={[0, 0, 0.11]} scale={[0.135, 0.145, 0.05]} color="#d6a37c" />
        </group>)}
        {kind === "bori" && [-1, 1].map((side) => <group key={side} position={[side * 0.43, 0.13, -0.03]} rotation={[0.04, 0, side * 0.14]}>
          <E position={[0, -0.13, 0]} scale={[0.16, 0.41, 0.16]} color="#c29465" />
          <E position={[0, -0.2, 0.13]} scale={[0.085, 0.22, 0.04]} color="#d8ab84" />
        </group>)}
        {kind === "owl" && [-1, 1].map((side) => <E key={side} position={[side * 0.35, 0.4, -0.06]} scale={[0.17, 0.27, 0.13]} rotation={[0, 0, side * -0.3]} color={c.fur} />)}
        {kind === "owl" && [-1, 1].map((side) => <E key={`disc${side}`} position={[side * 0.22, 0.035, 0.31]} scale={[0.28, 0.31, 0.12]} color={c.light} />)}
        {(kind === "momo" || kind === "bori") && <E position={[0, -0.17, faceZ - 0.015]} scale={[0.28, 0.21, 0.12]} color={c.light} />}
        <group ref={eyes} position={[0, 0.04, 0]}>
          {[-1, 1].map((side) => <group key={side} position={[side * c.eye, 0, faceZ]}>
            <E scale={[0.096, 0.122, 0.063]} color="#39291f" roughness={0.16} shadow={false} />
            <E position={[-0.027, 0.042, 0.052]} scale={[0.032, 0.035, 0.014]} color="#fffbed" roughness={0.08} shadow={false} />
            <E position={[0.033, -0.039, 0.053]} scale={[0.012, 0.012, 0.009]} color="#c99560" roughness={0.12} shadow={false} />
          </group>)}
        </group>
        {([-1, 1] as const).map((side) => <group key={side} ref={side < 0 ? browL : browR} position={[side * c.eye, 0.225, faceZ - 0.03]}>
          <E scale={[0.075, 0.018, 0.018]} rotation={[0, 0, side * -0.08]} color={kind === "alice" ? "#cbb08f" : "#7a5541"} shadow={false} />
        </group>)}
        {[-1, 1].map((side) => <E key={`cheek${side}`} position={[side * (c.eye + 0.12), -0.135, faceZ - 0.025]} scale={[0.095, 0.055, 0.022]} color={kind === "momo" ? "#d59a83" : "#edb0a3"} shadow={false} />)}
        {kind === "owl"
          ? <E position={[0, -0.12, faceZ + 0.12]} scale={[0.083, 0.12, 0.12]} color="#dba552" />
          : <E position={[0, -0.12, faceZ + (kind === "alice" ? 0.04 : 0.1)]} scale={[kind === "bori" ? 0.1 : 0.065, 0.047, 0.055]} color={kind === "alice" ? "#d89890" : "#604232"} roughness={0.4} />}
        <mesh ref={mouth} position={[0, -0.245, faceZ + (kind === "momo" || kind === "bori" ? 0.085 : -0.002)]} geometry={sphere} material={material("#784b40", 0.6)} scale={[0.055, 0.016, 0.018]} />
        {kind === "owl" && [-1, 1].map((side) => <mesh key={`glass${side}`} position={[side * c.eye, 0.04, faceZ + 0.08]} material={material("#b28c54", 0.38, 0.35)}><torusGeometry args={[0.145, 0.013, 8, 28]} /></mesh>)}
        {kind === "owl" && <Beam position={[0, 0.05, faceZ + 0.08]} scale={[0.01, 0.18, 0.01]} rotation={[0, 0, Math.PI / 2]} color="#b28c54" />}
      </group>
    </Limb>
  </group>;
}

function KayCharacter({ id, sim, talk }: { id: KayActor; sim: Sim; talk: Talk }) {
  const rig = useRef<Rig>({});
  const setLimb = useCallback<SetLimb>((name, limb) => { rig.current[name] = limb; }, []);
  const look = LOOKS[id];
  const build: Build = { middle: look.middle, upright: true };
  return <Puppet id={id} sim={sim} rig={rig} build={build}><KayBody id={id} build={look} sim={sim} talk={talk} rig={setLimb} /></Puppet>;
}

/** Kay's faces for the original four friends; Nabi and Dodo keep Harbir's bodies until they get their own. */
export function CastMember({ id, sim, talk }: { id: ActorId; sim: Sim; talk: Talk }) {
  if (isKayActor(id)) return <KayCharacter id={id} sim={sim} talk={talk} />;
  return <Character id={id as Exclude<ActorId, KayActor | "hero">} sim={sim} />;
}
