"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Component, Suspense, useMemo } from "react";
import type { ReactNode } from "react";
import { MathUtils } from "three";
import { JUMP_SECONDS, ROLL_SECONDS } from "@/lib/harbir/sim";
import type { ActorState, Pose, Sim } from "@/lib/harbir/sim";
import { LIGHT, PALETTE } from "@/lib/harbir/style";
import { Alice } from "./three/characters";
import { Blob } from "./three/primitives";

/** What Alice does on the landing page, on a loop: stand, wave, hop, roll over. */
const LOOP: { pose: Pose; seconds: number }[] = [
  { pose: "idle", seconds: 2.2 },
  { pose: "wave", seconds: 1.8 },
  { pose: "idle", seconds: 1.6 },
  { pose: "jump", seconds: JUMP_SECONDS + 0.2 },
  { pose: "idle", seconds: 1.8 },
  { pose: "roll", seconds: ROLL_SECONDS },
];
/** The loop entry a tap jumps to. */
const HOP = LOOP.findIndex(({ pose }) => pose === "jump");

type LoopingAlice = Sim & {
  /** Jump right away, then carry on with the loop. */
  hop(): void;
  /** Turn a little toward the pointer; x runs from -1 (left edge) to 1 (right edge). */
  look(x: number, dt: number): void;
};

/** A one-actor sim that only cycles poses, so Alice can stand alone without the meadow. */
function createLoopingAlice(): LoopingAlice {
  const hero: ActorState = { id: "hero", x: 0, z: 0, heading: 0, pose: "idle", poseTime: 0, travelled: 0, sitting: false, emotionLeft: 0 };
  let step = 0;
  let left = LOOP[0].seconds;
  return {
    actors: { hero },
    props: {},
    done: false,
    together: () => false,
    step(dt) {
      hero.poseTime += dt;
      left -= dt;
      if (left > 0) return;
      step = (step + 1) % LOOP.length;
      left = LOOP[step].seconds;
      hero.pose = LOOP[step].pose;
      hero.poseTime = 0;
    },
    hop() {
      step = HOP;
      left = LOOP[step].seconds;
      hero.pose = "jump";
      hero.poseTime = 0;
    },
    look(x, dt) {
      hero.heading = MathUtils.damp(hero.heading, x * 0.6, 4, dt);
    },
  };
}

/** Aims the camera at Alice, steps the loop, and turns Alice a little toward the pointer. */
function Driver({ sim }: { sim: LoopingAlice }) {
  useFrame(({ camera, pointer }, delta) => {
    camera.lookAt(0, 0.7, 0);
    sim.step(Math.min(delta, 0.05));
    sim.look(pointer.x, delta);
  });
  return null;
}

/** A small round patch of grass with a few flowers, so Alice has somewhere to stand. */
function Patch() {
  const flowers: [number, number, string][] = [[-0.85, 0.4, PALETTE.flowers[0]], [0.75, 0.6, PALETTE.flowers[2]], [0.95, -0.3, PALETTE.flowers[4]], [-0.55, -0.65, PALETTE.flowers[3]]];
  return (
    <group>
      <mesh position={[0, -0.12, 0]} receiveShadow>
        <cylinderGeometry args={[1.35, 1.25, 0.24, 48]} />
        <meshStandardMaterial color={PALETTE.grass} roughness={0.95} />
      </mesh>
      <mesh position={[0, -0.36, 0]}>
        <cylinderGeometry args={[1.25, 1.05, 0.26, 48]} />
        <meshStandardMaterial color={PALETTE.soil} roughness={0.95} />
      </mesh>
      {flowers.map(([x, z, color]) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          <Blob position={[0, 0.08, 0]} scale={[0.02, 0.09, 0.02]} color={PALETTE.stem} />
          <Blob position={[0, 0.18, 0]} scale={[0.07, 0.05, 0.07]} color={color} />
        </group>
      ))}
    </group>
  );
}

class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

export default function RabbitPreview() {
  const sim = useMemo(() => createLoopingAlice(), []);
  return (
    <PreviewBoundary>
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true }}
        camera={{ position: [0, 2, 6], fov: 28, near: 0.1, far: 40 }}
        onPointerDown={() => sim.hop()}
        aria-label="Alice the bunny. Click to make Alice hop."
      >
        <ambientLight intensity={LIGHT.ambient} />
        <hemisphereLight args={[LIGHT.hemisphere.sky, LIGHT.hemisphere.ground, LIGHT.hemisphere.intensity]} />
        <directionalLight
          position={[3, 6, 4]}
          color={LIGHT.sun.color}
          intensity={LIGHT.sun.intensity}
          castShadow
          shadow-mapSize={[1024, 1024]}
          shadow-normalBias={0.04}
        />
        <Driver sim={sim} />
        <Patch />
        <Suspense fallback={null}><Alice sim={sim} /></Suspense>
      </Canvas>
    </PreviewBoundary>
  );
}
