"use client";

import { useFrame, useLoader } from "@react-three/fiber";
import { useCallback, useMemo, useRef } from "react";
import type { RefObject } from "react";
import type { ReactNode } from "react";
import { Group, MathUtils } from "three";
import type { Object3D } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { motionOf } from "@/lib/harbir/motion";
import type { Motion } from "@/lib/harbir/motion";
import type { Sim } from "@/lib/harbir/sim";
import { PALETTE } from "@/lib/harbir/style";
import type { ActorId } from "@/lib/world";
import { Blob, Face } from "./primitives";

/** The parts the engine moves. Limb groups have their origin at the shoulder or hip. */
export interface Rig {
  leftArm?: Object3D | null;
  rightArm?: Object3D | null;
  leftLeg?: Object3D | null;
  rightLeg?: Object3D | null;
  /** Only Alice's model has a separate head, ears, and tail. */
  head?: Object3D | null;
  leftEar?: Object3D | null;
  rightEar?: Object3D | null;
  tail?: Object3D | null;
}
/** Registers a limb group with the character's rig. */
type SetLimb = (name: keyof Rig, limb: Object3D | null) => void;

/** Where the emotion bubble floats, per character. */
export const HEAD_HEIGHT: Record<ActorId, number> = { hero: 1.85, friend: 1.5, puppy: 1.15, grownup: 2, kitten: 1.1, duck: 1 };

/** How a body differs from the default build for its actor id. */
export interface Build {
  /** Height of the middle of the body, where somersaults turn. */
  middle?: number;
  /** Stands on two legs, so arm raises apply even to the puppy and kitten. */
  upright?: boolean;
}

/** Somersaults turn around the middle of the body, about half its height. */
const MIDDLE: Record<ActorId, number> = { hero: 0.85, friend: 0.68, puppy: 0.45, grownup: 0.95, kitten: 0.42, duck: 0.4 };

/** Smoothed values that carry over between frames, one set per character. */
interface Follow {
  heading: number;
  squash: number;
  lean: number;
  sway: number;
  curl: number;
  ear: number;
  earSpeed: number;
  droop: number;
  lastLift: number;
}
const newFollow = (heading: number): Follow => ({ heading, squash: 1, lean: 0, sway: 0, curl: 1, ear: 0.1, earSpeed: 0, droop: 0, lastLift: 0 });

/** The nested groups that pose a body: place and turn, lift, squash, lean, then flip around the middle. */
interface Frame {
  place: Group;
  lift: Group;
  squash: Group;
  lean: Group;
  flip: Group;
  center: Group;
}

/** Turn by the shortest way round. */
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Pose one character for this frame. Big body moves follow the motion closely; limbs, head,
 * and lean ease toward it so pose changes blend; ears ride a spring so they flop.
 */
function pose(id: ActorId, sim: Sim, frame: Frame, rig: Rig, follow: Follow, delta: number, clock: number, build: Build) {
  const actor = sim.actors[id];
  if (!actor) return;
  const dt = Math.min(delta, 1 / 30);
  const m: Motion = motionOf(actor, clock);

  const facing = actor.facing && sim.actors[actor.facing];
  const heading = facing ? Math.atan2(facing.x - actor.x, facing.z - actor.z) : actor.heading;
  const turn = wrapAngle(heading - follow.heading) * (1 - Math.exp(-dt * 10));
  follow.heading += turn;
  // Lean into turns while moving, like a child taking a corner.
  const moving = actor.pose === "walk" || actor.pose === "run";
  const corner = moving ? MathUtils.clamp((-turn / dt) * 0.05, -0.25, 0.25) : 0;

  const ease = 1 - Math.exp(-dt * 18);
  follow.squash += (m.squash - follow.squash) * ease;
  follow.lean += (m.lean - follow.lean) * ease;
  follow.sway += (m.sway + corner - follow.sway) * ease;
  follow.curl += (m.curl - follow.curl) * ease;

  frame.place.position.set(actor.x, 0, actor.z);
  frame.place.rotation.y = follow.heading + m.spin;
  frame.lift.position.y = m.lift;
  const width = 1 / Math.sqrt(follow.squash);
  frame.squash.scale.set(width, follow.squash, width);
  frame.lean.rotation.set(follow.lean, 0, follow.sway);
  const middle = build.middle ?? MIDDLE[id];
  // Pivot at the middle of the curled body, so a tucked ball still rests on the ground.
  frame.flip.position.y = middle * follow.curl;
  frame.flip.rotation.x = m.flip;
  frame.flip.scale.setScalar(follow.curl);
  frame.center.position.y = -middle;

  const limb = (part: Object3D | null | undefined, x: number, z: number) => {
    if (!part) return;
    part.rotation.x = MathUtils.damp(part.rotation.x, x, 16, dt);
    part.rotation.z = MathUtils.damp(part.rotation.z, z, 16, dt);
  };
  // Four-legged friends use their arms as front legs: they swing but never lift out to the side.
  const raise = !build.upright && (id === "puppy" || id === "kitten") ? 0 : 1;
  limb(rig.leftArm, m.armLeft, -m.raiseLeft * raise);
  limb(rig.rightArm, m.armRight, m.raiseRight * raise);
  limb(rig.leftLeg, m.legLeft, 0);
  limb(rig.rightLeg, m.legRight, 0);
  limb(rig.head, m.nod, m.tilt);

  // Ears lag behind the body: rising pushes them back, falling lifts them.
  const rising = (m.lift - follow.lastLift) / dt;
  follow.lastLift = m.lift;
  const earTarget = m.ears + MathUtils.clamp(rising * 0.3, -0.5, 0.7);
  follow.earSpeed += (160 * (earTarget - follow.ear) - 11 * follow.earSpeed) * dt;
  follow.ear += follow.earSpeed * dt;
  follow.droop = MathUtils.damp(follow.droop, m.droop, 6, dt);
  if (rig.leftEar) rig.leftEar.rotation.set(-follow.ear, 0, follow.droop);
  if (rig.rightEar) rig.rightEar.rotation.set(-follow.ear, 0, -follow.droop);
  if (rig.tail) rig.tail.rotation.y = m.tail;
}

/** Wraps a body in the posing groups and drives it every frame. */
export function Puppet({ id, sim, rig, build = {}, children }: { id: ActorId; sim: Sim; rig: RefObject<Rig>; build?: Build; children: ReactNode }) {
  const place = useRef<Group>(null);
  const lift = useRef<Group>(null);
  const squash = useRef<Group>(null);
  const lean = useRef<Group>(null);
  const flip = useRef<Group>(null);
  const center = useRef<Group>(null);
  const follow = useRef<Follow | null>(null);
  useFrame(({ clock }, delta) => {
    if (!place.current || !lift.current || !squash.current || !lean.current || !flip.current || !center.current) return;
    follow.current ??= newFollow(sim.actors[id]?.heading ?? 0);
    const frame = { place: place.current, lift: lift.current, squash: squash.current, lean: lean.current, flip: flip.current, center: center.current };
    pose(id, sim, frame, rig.current, follow.current, delta, clock.elapsedTime, build);
  });
  return (
    <group ref={place}>
      <group ref={lift}>
        <group ref={squash}>
          <group ref={lean}>
            <group ref={flip}>
              <group ref={center}>{children}</group>
            </group>
          </group>
        </group>
      </group>
    </group>
  );
}

/**
 * Regroup Alice's model so its head moves as one piece and each ear swings from its base.
 * The model ships as loose parts under one root; attach keeps every part where it was.
 */
function rigAlice(model: Object3D): Rig {
  model.updateMatrixWorld(true);
  const part = (name: string) => model.getObjectByName(name);
  const root = part("Head")?.parent;
  if (!root) return {};
  const pivot = (parent: Object3D, x: number, y: number, z: number) => {
    const group = new Group();
    group.position.set(x, y, z);
    parent.add(group);
    group.updateMatrixWorld(true);
    return group;
  };
  const head = pivot(root, 0, 1.15, 0);
  for (const name of ["Head", "Eye-1", "Eye1", "EyeSparkle-1", "EyeSparkle1", "Cheek-1", "Cheek1", "Nose", "Mouth"]) {
    const piece = part(name);
    if (piece) head.attach(piece);
  }
  const ear = (side: "-1" | "1", x: number) => {
    const group = pivot(head, x, 0.43, -0.04);
    for (const name of [`Ear${side}`, `EarInner${side}`]) {
      const piece = part(name);
      if (piece) group.attach(piece);
    }
    return group;
  };
  const tail = part("Tail");
  const tailPivot = tail ? pivot(root, 0, 0.67, -0.2) : null;
  if (tail && tailPivot) tailPivot.attach(tail);
  return {
    leftArm: part("LeftArm"),
    rightArm: part("RightArm"),
    leftLeg: part("LeftLeg"),
    rightLeg: part("RightLeg"),
    head,
    leftEar: ear("-1", -0.23),
    rightEar: ear("1", 0.23),
    tail: tailPivot,
  };
}

/** Alice, from Kay's model, posed by the same motion as everyone else. */
export function Alice({ sim }: { sim: Sim }) {
  const gltf = useLoader(GLTFLoader, "/demo/alice.glb");
  const [model, rig] = useMemo(() => {
    const copy = gltf.scene.clone(true);
    copy.traverse((object) => { object.castShadow = true; });
    copy.scale.setScalar(0.72);
    return [copy, { current: rigAlice(copy) }] as const;
  }, [gltf]);
  return <Puppet id="hero" sim={sim} rig={rig}><primitive object={model} dispose={null} /></Puppet>;
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

/** Nabi the kitten: ginger tabby fur, pointed ears, curled tail, lilac bow. Front legs use the arm slots. */
function Nabi({ rig }: { rig: SetLimb }) {
  return (
    <group>
      {([[-1, 1], [1, 1], [-1, -1], [1, -1]] as const).map(([side, front]) => (
        <Limb
          key={`${side}${front}`}
          rig={rig}
          name={front > 0 ? (side < 0 ? "leftArm" : "rightArm") : side < 0 ? "leftLeg" : "rightLeg"}
          position={[side * 0.13, 0.3, front * 0.2]}
        >
          <Blob position={[0, -0.14, 0]} scale={[0.07, 0.16, 0.07]} color={PALETTE.kittenFur} />
          <Blob position={[0, -0.28, 0.03]} scale={[0.07, 0.04, 0.08]} color={PALETTE.kittenBelly} shadow={false} />
        </Limb>
      ))}
      <Blob position={[0, 0.42, 0]} scale={[0.25, 0.22, 0.38]} color={PALETTE.kittenFur} />
      <Blob position={[0, 0.36, 0.04]} scale={[0.18, 0.14, 0.3]} color={PALETTE.kittenBelly} shadow={false} />
      {[-0.12, 0.02, 0.16].map((z) => <Blob key={z} position={[0, 0.6, z]} scale={[0.2, 0.04, 0.035]} color={PALETTE.kittenStripe} shadow={false} />)}
      {/* The tail curls up behind, like a question mark. */}
      {[[0, 0.48, -0.4, 0.06], [0, 0.66, -0.48, 0.055], [0, 0.84, -0.44, 0.05], [0, 0.95, -0.34, 0.045]].map(([x, y, z, r]) => (
        <Blob key={y} position={[x, y, z]} scale={[r, r * 1.3, r]} color={PALETTE.kittenFur} />
      ))}
      <Blob position={[0, 0.8, 0.3]} scale={[0.26, 0.23, 0.23]} color={PALETTE.kittenFur} />
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.15, 1.0, 0.27]} rotation={[0, 0, -side * 0.25]}>
          <mesh castShadow><coneGeometry args={[0.08, 0.17, 4]} /><meshStandardMaterial color={PALETTE.kittenFur} roughness={0.85} /></mesh>
          <mesh position={[0, -0.01, 0.03]} scale={[0.6, 0.7, 0.4]}><coneGeometry args={[0.08, 0.17, 4]} /><meshStandardMaterial color={PALETTE.cheek} roughness={0.85} /></mesh>
        </group>
      ))}
      <Blob position={[0, 0.95, 0.38]} scale={[0.05, 0.05, 0.02]} color={PALETTE.kittenStripe} shadow={false} />
      <Blob position={[0, 0.74, 0.5]} scale={[0.11, 0.08, 0.06]} color={PALETTE.kittenBelly} shadow={false} />
      <Blob position={[0.16, 0.66, 0.44]} rotation={[0, 0, 0.4]} scale={[0.07, 0.045, 0.04]} color={PALETTE.kittenBow} />
      <Blob position={[0.24, 0.66, 0.42]} rotation={[0, 0, -0.4]} scale={[0.07, 0.045, 0.04]} color={PALETTE.kittenBow} />
      <Face center={[0, 0.82, 0.3]} size={0.23} nose={PALETTE.cheek} spread={1.05} />
    </group>
  );
}

/** Dodo the duckling: round yellow down, orange bill and feet. Wings use the arm slots. */
function Dodo({ rig }: { rig: SetLimb }) {
  return (
    <group>
      {[-1, 1].map((side) => (
        <Limb key={`foot${side}`} rig={rig} name={side < 0 ? "leftLeg" : "rightLeg"} position={[side * 0.12, 0.2, 0.02]}>
          <Blob position={[0, -0.1, 0]} scale={[0.03, 0.1, 0.03]} color={PALETTE.duckBill} />
          <Blob position={[0, -0.19, 0.06]} scale={[0.09, 0.025, 0.11]} color={PALETTE.duckBill} />
        </Limb>
      ))}
      <Blob position={[0, 0.42, 0]} scale={[0.3, 0.28, 0.32]} color={PALETTE.duckDown} />
      <Blob position={[0, 0.5, -0.3]} rotation={[0.6, 0, 0]} scale={[0.1, 0.06, 0.1]} color={PALETTE.duckDown} />
      {[-1, 1].map((side) => (
        <Limb key={`wing${side}`} rig={rig} name={side < 0 ? "leftArm" : "rightArm"} position={[side * 0.28, 0.52, -0.02]}>
          <Blob position={[0, -0.1, 0]} scale={[0.06, 0.15, 0.16]} color={PALETTE.duckWing} />
        </Limb>
      ))}
      <Blob position={[0, 0.82, 0.03]} scale={[0.24, 0.23, 0.22]} color={PALETTE.duckDown} />
      <Blob position={[0, 1.06, 0]} scale={[0.04, 0.06, 0.04]} color={PALETTE.duckDown} />
      <Blob position={[0, 0.77, 0.24]} scale={[0.11, 0.04, 0.09]} color={PALETTE.duckBill} />
      <Face center={[0, 0.84, 0.03]} size={0.22} nose={PALETTE.duckDown} spread={0.95} />
    </group>
  );
}

const BODIES = { friend: Momo, puppy: Bori, grownup: GrandmaOwl, kitten: Nabi, duck: Dodo } as const;
/** Alice stays the biggest child; Grandma Owl is the tallest. */
const BODY_SCALE = { friend: 0.88, puppy: 0.9, grownup: 1, kitten: 0.95, duck: 0.95 } as const;

export function Character({ id, sim }: { id: keyof typeof BODIES; sim: Sim }) {
  // Filled in by each limb's ref callback after render; Puppet only reads it inside useFrame.
  const rig = useRef<Rig>({});
  const setLimb = useCallback<SetLimb>((name, limb) => { rig.current[name] = limb; }, []);
  const Body = BODIES[id];
  return (
    <Puppet id={id} sim={sim} rig={rig}>
      <group scale={BODY_SCALE[id]}><Body rig={setLimb} /></group>
    </Puppet>
  );
}
