"use client";

import { useFrame, useLoader } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { AnimationMixer, MathUtils } from "three";
import type { Group, Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { ActorState, Sim } from "@/lib/harbir/sim";
import { PALETTE } from "@/lib/harbir/style";
import type { ActorId } from "@/lib/world";
import { Blob, Face } from "./primitives";

/** Named limbs the engine swings. Each is a group whose origin is the shoulder or hip. */
interface Rig {
  leftArm?: Object3D | null;
  rightArm?: Object3D | null;
  leftLeg?: Object3D | null;
  rightLeg?: Object3D | null;
}
/** Registers a limb group with the character's rig. */
type SetLimb = (name: keyof Rig, limb: Object3D | null) => void;

/** Where the emotion bubble floats, per character. */
export const HEAD_HEIGHT: Record<ActorId, number> = { hero: 1.85, friend: 1.5, puppy: 1.15, grownup: 2 };

/** Whole-body motion: bobbing, hopping, sitting, leaning, spinning, and facing. */
function applyBody(group: Group, actor: ActorState, sim: Sim) {
  const t = actor.poseTime;
  let y = 0, lean = 0, spin = 0, squash = 1;
  switch (actor.pose) {
    case "walk": y = Math.abs(Math.sin(t * 9)) * 0.06; break;
    case "run": y = Math.abs(Math.sin(t * 15)) * 0.14; lean = 0.15; break;
    case "jump": y = Math.abs(Math.sin(t * Math.PI * 2)) * 0.55; break;
    case "celebrate": y = Math.abs(Math.sin(t * 7)) * 0.4; spin = t * 6; break;
    case "hug": case "help": case "reach": lean = 0.22; break;
    case "idle": if (!actor.sitting) y = Math.sin(t * 2.2) * 0.015; break;
  }
  if (actor.sitting && (actor.pose === "idle" || actor.pose === "sit")) { y = -0.12; squash = 0.86; }
  let heading = actor.heading;
  const facing = actor.facing && sim.actors[actor.facing];
  if (facing) heading = Math.atan2(facing.x - actor.x, facing.z - actor.z);
  group.position.set(actor.x, y, actor.z);
  group.rotation.set(lean, heading + spin, 0, "YXZ");
  group.scale.set(1, squash, 1);
}

/** Target limb angles for each pose: [arm swing x, arm raise z, leg swing x]. */
function limbTargets(actor: ActorState) {
  const t = actor.poseTime;
  const swing = (speed: number, size: number) => Math.sin(t * speed) * size;
  switch (actor.pose) {
    case "walk": return { arm: -swing(9, 0.5), raiseLeft: 0, raiseRight: 0, leg: swing(9, 0.6) };
    case "run": return { arm: -swing(15, 0.9), raiseLeft: 0, raiseRight: 0, leg: swing(15, 0.9) };
    case "wave": return { arm: 0, raiseLeft: 0, raiseRight: 2.5 + swing(10, 0.3), leg: 0 };
    case "hug": case "help": case "reach": return { arm: -1.3, raiseLeft: 0, raiseRight: 0, leg: 0 };
    case "celebrate": case "jump": return { arm: 0, raiseLeft: 2.4, raiseRight: 2.4, leg: 0 };
    case "sit": return { arm: 0, raiseLeft: 0.15, raiseRight: 0.15, leg: -1.4 };
    case "idle": return actor.sitting
      ? { arm: 0, raiseLeft: 0.15, raiseRight: 0.15, leg: -1.4 }
      : { arm: swing(2, 0.04), raiseLeft: 0.05, raiseRight: 0.05, leg: 0 };
  }
}

/** Swing the rig toward the pose. Legs mirror each other; the left arm raises with negative z. */
function animateLimbs(rig: Rig, actor: ActorState, delta: number, snap = false) {
  const target = limbTargets(actor);
  const ease = (from: number, to: number) => (snap ? to : MathUtils.damp(from, to, 14, delta));
  const set = (limb: Object3D | null | undefined, x: number, z: number) => {
    if (!limb) return;
    limb.rotation.x = ease(limb.rotation.x, x);
    limb.rotation.z = ease(limb.rotation.z, z);
  };
  const stride = actor.pose === "walk" || actor.pose === "run";
  set(rig.leftArm, target.arm, -target.raiseLeft);
  set(rig.rightArm, stride ? -target.arm : target.arm, target.raiseRight);
  set(rig.leftLeg, target.leg, 0);
  set(rig.rightLeg, stride ? -target.leg : target.leg, 0);
}

/** Kimi, from Kay's model. Its clips drive walking and running; the engine handles the rest. */
export function Kimi({ sim }: { sim: Sim }) {
  const gltf = useLoader(GLTFLoader, "/demo/kimi.glb");
  const outer = useRef<Group>(null);
  const model = useMemo(() => {
    const copy = gltf.scene.clone(true);
    copy.traverse((object) => { object.castShadow = true; });
    return copy;
  }, [gltf]);
  const rig = useMemo<Rig>(() => ({
    leftArm: model.getObjectByName("LeftArm"),
    rightArm: model.getObjectByName("RightArm"),
    leftLeg: model.getObjectByName("LeftLeg"),
    rightLeg: model.getObjectByName("RightLeg"),
  }), [model]);
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  /** The sim moves Kimi through the world, so drop the clips' own back-and-forth root motion. */
  const clips = useMemo(() => Object.fromEntries(gltf.animations.map((clip) => {
    const limbsOnly = clip.clone();
    limbsOnly.tracks = limbsOnly.tracks.filter((track) => !track.name.endsWith(".position"));
    return [clip.name, limbsOnly];
  })), [gltf]);
  const playing = useRef("");

  useEffect(() => () => { mixer.stopAllAction(); mixer.uncacheRoot(model); }, [mixer, model]);
  useFrame((_state, delta) => {
    const kimi = sim.actors.hero;
    if (!kimi || !outer.current) return;
    applyBody(outer.current, kimi, sim);
    const clip = kimi.pose === "walk" || kimi.pose === "run" ? kimi.pose : "idle";
    if (clip !== playing.current && clips[clip]) {
      mixer.stopAllAction();
      mixer.clipAction(clips[clip]).reset().fadeIn(0.15).play();
      playing.current = clip;
    }
    mixer.update(Math.min(delta, 0.05));
    if (clip === "idle") animateLimbs(rig, kimi, delta, true);
  });
  return <group ref={outer}><primitive object={model} scale={0.72} dispose={null} /></group>;
}

function Limb({ rig, name, position, children }: { rig: SetLimb; name: keyof Rig; position: [number, number, number]; children: ReactNode }) {
  return <group position={position} ref={(group) => rig(name, group)}>{children}</group>;
}

/** Momo the bear cub: warm brown, round ears, light muzzle, blue scarf. */
function Momo({ rig }: { rig: SetLimb }) {
  return (
    <group>
      {[-1, 1].map((side) => (
        <Limb key={`leg${side}`} rig={rig} name={side < 0 ? "leftLeg" : "rightLeg"} position={[side * 0.17, 0.34, 0]}>
          <Blob position={[0, -0.18, 0.04]} scale={[0.13, 0.18, 0.15]} color={PALETTE.bearFur} />
        </Limb>
      ))}
      <Blob position={[0, 0.62, 0]} scale={[0.36, 0.4, 0.32]} color={PALETTE.bearFur} />
      <Blob position={[0, 0.58, 0.2]} scale={[0.22, 0.25, 0.14]} color={PALETTE.bearMuzzle} />
      {[-1, 1].map((side) => (
        <Limb key={`arm${side}`} rig={rig} name={side < 0 ? "leftArm" : "rightArm"} position={[side * 0.35, 0.86, 0]}>
          <Blob position={[0, -0.2, 0]} scale={[0.1, 0.23, 0.1]} color={PALETTE.bearFur} />
        </Limb>
      ))}
      <mesh position={[0, 0.92, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.25, 0.07, 12, 32]} />
        <meshStandardMaterial color={PALETTE.bearScarf} roughness={0.9} />
      </mesh>
      <Blob position={[0, 1.18, 0]} scale={[0.38, 0.35, 0.33]} color={PALETTE.bearFur} />
      {[-1, 1].map((side) => (
        <group key={`ear${side}`}>
          <Blob position={[side * 0.27, 1.45, -0.02]} scale={[0.12, 0.12, 0.08]} color={PALETTE.bearFur} />
          <Blob position={[side * 0.27, 1.45, 0.04]} scale={[0.07, 0.07, 0.03]} color={PALETTE.bearMuzzle} shadow={false} />
        </group>
      ))}
      <Blob position={[0, 1.08, 0.27]} scale={[0.15, 0.11, 0.09]} color={PALETTE.bearMuzzle} />
      <Face center={[0, 1.2, 0]} size={0.34} nose={PALETTE.eye} />
    </group>
  );
}

/** Bori the puppy: honey fur, floppy ears, pink collar. Front legs use the arm slots. */
function Bori({ rig }: { rig: SetLimb }) {
  return (
    <group>
      {([[-1, 1], [1, 1], [-1, -1], [1, -1]] as const).map(([side, front]) => (
        <Limb
          key={`${side}${front}`}
          rig={rig}
          name={front > 0 ? (side < 0 ? "leftArm" : "rightArm") : side < 0 ? "leftLeg" : "rightLeg"}
          position={[side * 0.16, 0.32, front * 0.22]}
        >
          <Blob position={[0, -0.15, 0]} scale={[0.08, 0.17, 0.08]} color={PALETTE.puppyFur} />
        </Limb>
      ))}
      <Blob position={[0, 0.46, 0]} scale={[0.3, 0.27, 0.42]} color={PALETTE.puppyFur} />
      <Blob position={[0, 0.62, -0.42]} rotation={[-0.6, 0, 0]} scale={[0.05, 0.15, 0.05]} color={PALETTE.puppyEar} />
      <mesh position={[0, 0.66, 0.27]} rotation={[Math.PI / 2 - 0.4, 0, 0]}>
        <torusGeometry args={[0.2, 0.04, 10, 28]} />
        <meshStandardMaterial color={PALETTE.puppyCollar} roughness={0.8} />
      </mesh>
      <Blob position={[0, 0.86, 0.32]} scale={[0.29, 0.27, 0.26]} color={PALETTE.puppyFur} />
      {[-1, 1].map((side) => (
        <Blob key={side} position={[side * 0.26, 0.82, 0.3]} rotation={[0, 0, side * 0.25]} scale={[0.08, 0.19, 0.07]} color={PALETTE.puppyEar} />
      ))}
      <Blob position={[0, 0.78, 0.53]} scale={[0.13, 0.1, 0.1]} color={PALETTE.bearMuzzle} />
      <Blob position={[0, 0.82, 0.63]} scale={[0.05, 0.04, 0.035]} color={PALETTE.eye} shadow={false} />
      <Face center={[0, 0.9, 0.32]} size={0.26} nose={PALETTE.eye} spread={1.05} />
    </group>
  );
}

/** Grandma Owl: soft brown feathers, ear tufts, gold glasses, lilac shawl. Wings use the arm slots. */
function GrandmaOwl({ rig }: { rig: SetLimb }) {
  return (
    <group>
      {[-1, 1].map((side) => (
        <Limb key={`foot${side}`} rig={rig} name={side < 0 ? "leftLeg" : "rightLeg"} position={[side * 0.16, 0.14, 0.12]}>
          <Blob position={[0, -0.08, 0.04]} scale={[0.1, 0.05, 0.12]} color={PALETTE.beak} />
        </Limb>
      ))}
      <Blob position={[0, 0.72, 0]} scale={[0.48, 0.6, 0.42]} color={PALETTE.owlFeather} />
      <Blob position={[0, 0.66, 0.26]} scale={[0.32, 0.42, 0.2]} color={PALETTE.owlBelly} />
      {[-1, 1].map((side) => (
        <Limb key={`wing${side}`} rig={rig} name={side < 0 ? "leftArm" : "rightArm"} position={[side * 0.44, 0.98, 0]}>
          <Blob position={[0, -0.26, 0]} scale={[0.11, 0.32, 0.22]} color={PALETTE.owlFeather} />
        </Limb>
      ))}
      <mesh position={[0, 1.06, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.38, 0.1, 12, 32]} />
        <meshStandardMaterial color={PALETTE.owlShawl} roughness={0.95} />
      </mesh>
      <Blob position={[0, 1.38, 0]} scale={[0.42, 0.37, 0.36]} color={PALETTE.owlFeather} />
      {[-1, 1].map((side) => (
        <group key={`tuft${side}`}>
          <Blob position={[side * 0.27, 1.74, -0.02]} rotation={[0, 0, -side * 0.4]} scale={[0.07, 0.15, 0.06]} color={PALETTE.owlFeather} />
          <Blob position={[side * 0.14, 1.43, 0.27]} scale={[0.15, 0.16, 0.06]} color={PALETTE.owlBelly} shadow={false} />
          <mesh position={[side * 0.14, 1.43, 0.34]}>
            <torusGeometry args={[0.13, 0.014, 8, 24]} />
            <meshStandardMaterial color={PALETTE.gold} roughness={0.4} metalness={0.3} />
          </mesh>
        </group>
      ))}
      <Face center={[0, 1.38, 0]} size={0.36} nose={PALETTE.beak} spread={0.82} />
    </group>
  );
}

const BODIES = { friend: Momo, puppy: Bori, grownup: GrandmaOwl } as const;
/** Kimi stays the biggest child; Grandma Owl is the tallest. */
const BODY_SCALE = { friend: 0.88, puppy: 0.9, grownup: 1 } as const;

export function Character({ id, sim }: { id: keyof typeof BODIES; sim: Sim }) {
  const group = useRef<Group>(null);
  const rig = useRef<Rig>({});
  const setLimb = useCallback<SetLimb>((name, limb) => { rig.current[name] = limb; }, []);
  const Body = BODIES[id];
  useFrame((_state, delta) => {
    const actor = sim.actors[id];
    if (!actor || !group.current) return;
    applyBody(group.current, actor, sim);
    animateLimbs(rig.current, actor, delta);
  });
  return <group ref={group}><group scale={BODY_SCALE[id]}><Body rig={setLimb} /></group></group>;
}
