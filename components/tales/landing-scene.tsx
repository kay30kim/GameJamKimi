"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ACESFilmicToneMapping, MathUtils, Plane, Raycaster, Vector2, Vector3 } from "three";
import { Blob } from "@/components/harbir/three/primitives";
import { JUMP_SECONDS } from "@/lib/harbir/sim";
import type { ActorState, Pose, Sim } from "@/lib/harbir/sim";
import { PALETTE } from "@/lib/harbir/style";
import type { ActorId } from "@/lib/world";
import { CastMember } from "./bodies";
import type { Talk } from "./bodies";

type Loop = { pose: Pose; seconds: number }[];

/** Who stands on the landing meadow, where, and what each does on a loop. */
const CAST: { id: ActorId; x: number; z: number; loop: Loop }[] = [
  { id: "puppy", x: -1.55, z: 0.15, loop: [{ pose: "idle", seconds: 3.1 }, { pose: "dance", seconds: 2.2 }, { pose: "idle", seconds: 2.4 }] },
  { id: "hero", x: -0.45, z: 0.45, loop: [{ pose: "idle", seconds: 2.2 }, { pose: "wave", seconds: 1.8 }, { pose: "idle", seconds: 2.6 }, { pose: "jump", seconds: JUMP_SECONDS + 0.2 }] },
  { id: "friend", x: 0.65, z: 0.2, loop: [{ pose: "idle", seconds: 3.6 }, { pose: "clap", seconds: 1.3 }, { pose: "idle", seconds: 1.9 }] },
  { id: "grownup", x: 1.75, z: -0.25, loop: [{ pose: "idle", seconds: 4.4 }, { pose: "wave", seconds: 1.8 }] },
];

type LandingSim = Sim & {
  /** Hop right away, then carry on with the loop. */
  hop(id: ActorId): void;
  /** Turn bodies part of the way toward a point, so heads do the rest. */
  face(point: Vector3, dt: number): void;
};

/** A sim with no story: everyone stands in place and cycles their own poses. */
function createLandingSim(still: boolean): LandingSim {
  const crew = CAST.map(({ id, x, z, loop }, index) => ({
    loop,
    step: 0,
    // Offset each loop so they don't all move at once.
    left: loop[0].seconds * (0.3 + index * 0.25),
    actor: { id, x, z, heading: 0, pose: "idle", poseTime: index, travelled: 0, sitting: false, emotionLeft: 0 } as ActorState,
  }));
  const actors = Object.fromEntries(crew.map(({ actor }) => [actor.id, actor]));
  return {
    actors,
    props: {},
    done: false,
    completedBeats: 0,
    finish: () => false,
    together: () => false,
    step(dt) {
      for (const member of crew) {
        member.actor.poseTime += dt;
        if (still) continue;
        member.left -= dt;
        if (member.left > 0) continue;
        member.step = (member.step + 1) % member.loop.length;
        member.left = member.loop[member.step].seconds;
        member.actor.pose = member.loop[member.step].pose;
        member.actor.poseTime = 0;
      }
    },
    hop(id) {
      const member = crew.find(({ actor }) => actor.id === id);
      if (!member || member.actor.pose === "jump") return;
      member.actor.pose = "jump";
      member.actor.poseTime = 0;
      member.left = JUMP_SECONDS + 0.2;
    },
    face(point, dt) {
      for (const { actor } of crew) {
        const toward = Math.atan2(point.x - actor.x, point.z - actor.z);
        actor.heading = MathUtils.damp(actor.heading, MathUtils.clamp(toward * 0.45, -0.5, 0.5), 3, dt);
      }
    },
  };
}

/** Pointer position on the page in the canvas's normalized coordinates; null when off the page. */
function usePagePointer(element: { current: HTMLElement | null }) {
  const pointer = useRef<Vector2 | null>(null);
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const box = element.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;
      pointer.current = new Vector2(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1);
    };
    const leave = () => { pointer.current = null; };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
    };
  }, [element]);
  return pointer;
}

/** The plane the pointer is projected onto: just in front of the cast, facing the camera. */
const WATCH_PLANE = new Plane(new Vector3(0, 0, 1), -2.2);
const LOOK_AT = new Vector3(0.1, 0.62, 0);

/** Steps the loops and points the cast at the cursor, or at the viewer when the cursor is away. */
function Driver({ sim, watch, pointerRef }: { sim: LandingSim; watch: Vector3; pointerRef: { current: Vector2 | null } }) {
  const ray = useMemo(() => new Raycaster(), []);
  const hit = useMemo(() => new Vector3(), []);
  useFrame(({ camera }, delta) => {
    camera.lookAt(LOOK_AT);
    const dt = Math.min(delta, 0.05);
    sim.step(dt);
    const pointer = pointerRef.current;
    ray.setFromCamera(pointer ?? new Vector2(0, 0), camera);
    const goal = pointer && ray.ray.intersectPlane(WATCH_PLANE, hit) ? hit : camera.position;
    watch.lerp(goal, 1 - Math.exp(-dt * 10));
    sim.face(watch, dt);
  });
  return null;
}

/** Grass that fades into the page instead of ending at an edge, with a few flowers and pebbles. */
function Ground() {
  const flowers: [number, number, string][] = [
    [-2.4, 0.9, PALETTE.flowers[0]], [-0.95, 1.25, PALETTE.flowers[1]], [0.15, 1.1, PALETTE.flowers[3]],
    [1.25, 1.0, PALETTE.flowers[2]], [2.55, 0.55, PALETTE.flowers[0]], [-2.1, -0.8, PALETTE.flowers[4]],
    [2.3, -1.0, PALETTE.flowers[1]], [0.1, -1.1, PALETTE.flowers[0]],
  ];
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[9, 64]} />
        <meshStandardMaterial color={PALETTE.grass} roughness={0.95} />
      </mesh>
      {flowers.map(([x, z, color]) => (
        <group key={`${x},${z}`} position={[x, 0, z]}>
          <Blob position={[0, 0.07, 0]} scale={[0.018, 0.08, 0.018]} color={PALETTE.stem} />
          <Blob position={[0, 0.16, 0]} scale={[0.065, 0.045, 0.065]} color={color} />
        </group>
      ))}
      {[[-3, 0.2, 0.18], [3.1, -0.1, 0.22], [-1.0, -1.4, 0.14]].map(([x, z, s]) => (
        <Blob key={`${x},${z}`} position={[x, s * 0.4, z]} scale={[s * 1.3, s * 0.8, s]} color={PALETTE.grassDeep} />
      ))}
    </group>
  );
}

function Scene({ still, box }: { still: boolean; box: { current: HTMLDivElement | null } }) {
  const sim = useMemo(() => createLandingSim(still), [still]);
  const watch = useMemo(() => new Vector3(0, 1, 6), []);
  const talk = useMemo<Talk>(() => ({ line: null, speaking: false, watch }), [watch]);
  const pointer = usePagePointer(box);
  return <>
    <ambientLight intensity={0.34} color="#fff1e0" />
    <hemisphereLight args={["#e4f0ef", "#45663c", 1.15]} />
    <directionalLight position={[-4, 8, 6]} color="#ffe4c2" intensity={2.6} castShadow
      shadow-mapSize={[1024, 1024]} shadow-camera-left={-5} shadow-camera-right={5} shadow-camera-top={5} shadow-camera-bottom={-5}
      shadow-normalBias={0.045} shadow-radius={3} />
    <directionalLight position={[5, 6, -7]} color="#fff2d7" intensity={1.1} />
    <Driver sim={sim} watch={watch} pointerRef={pointer} />
    <Ground />
    {CAST.map(({ id }) => (
      <group key={id} onPointerDown={(event) => { event.stopPropagation(); sim.hop(id); }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = ""; }}>
        <CastMember id={id} sim={sim} talk={talk} />
      </group>
    ))}
  </>;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? null : this.props.children; }
}

/** Alice and friends on a patch of meadow, watching the cursor. Tap one to make them hop. */
export default function LandingScene() {
  const box = useRef<HTMLDivElement>(null);
  // This only renders on the client, so the media query is safe to read here.
  const [still] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  return (
    <SceneBoundary>
      <div ref={box} style={{ width: "100%", height: "100%" }}>
        <Canvas
          shadows="soft"
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true, toneMapping: ACESFilmicToneMapping }}
          camera={{ position: [0, 1.7, 6.4], fov: 30, near: 0.1, far: 40 }}
          aria-label="Alice and friends standing in the meadow. Tap one to make them hop."
        >
          <Scene still={still} box={box} />
        </Canvas>
      </div>
    </SceneBoundary>
  );
}
