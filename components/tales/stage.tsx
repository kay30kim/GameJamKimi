"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { ACESFilmicToneMapping, MathUtils, PCFShadowMap, Vector3 } from "three";
import type { DirectionalLight, PerspectiveCamera } from "three";
import { Rain } from "@/components/harbir/three/effects";
import { Meadow } from "@/components/harbir/three/landmarks";
import { PropItem } from "@/components/harbir/three/props";
import { createSim } from "@/lib/harbir/sim";
import type { Sim } from "@/lib/harbir/sim";
import type { ActorId, PropId, Stage } from "@/lib/world";
import { CastMember } from "./bodies";
import { needsCameraCut, planCamera, wrapCameraAngle } from "@/lib/camera-director";
import type { CameraFrame, CameraSubjects } from "@/lib/camera-director";
import type { Talk } from "./bodies";

/** Kay's warm storybook light, with a peach evening and a grey rainy variant. */
const SKY = { sunny: "#c5dece", rainy: "#b4c3c4", sunset: "#f3d5bd" } as const;
const SUN = {
  sunny: { color: "#ffe4c2", intensity: 2.8, offset: [-7, 14, 9] },
  rainy: { color: "#e8eef0", intensity: 1.3, offset: [-7, 14, 9] },
  sunset: { color: "#ffb47a", intensity: 2.6, offset: [-12, 6, 4] },
} as const;
const SHADOW_RANGE = 14;

/** A line establishes its shot before audio starts; motion then settles into a hold. */
function CameraDirector({ sim, subjects, talk, sun, sunOffset, reducedMotion, overview, paused, cameraFrame }: {
  sim: Sim; subjects: CameraSubjects; talk: Talk; sun: React.RefObject<DirectionalLight | null>;
  sunOffset: readonly [number, number, number]; reducedMotion: boolean; overview: boolean;
  paused: boolean; cameraFrame?: CameraFrame;
}) {
  const look = useRef(new Vector3(0, 1, 0));
  const aim = useRef(new Vector3());
  const goal = useRef(new Vector3());
  const ready = useRef(false);
  const shots = useRef({ sim, line: null as Talk["line"], overview, elapsed: 0, count: 0, center: 0.4 });
  const { size } = useThree();
  useFrame(({ camera }, delta) => {
    if (size.width <= 0 || size.height <= 0) return;
    if (paused && ready.current) return;
    const state = shots.current;
    const changed = state.sim !== sim || state.line !== talk.line || state.overview !== overview;
    if (changed) {
      state.sim = sim;
      state.line = talk.line;
      state.overview = overview;
      state.elapsed = 0;
      state.count += 1;
    }
    const dt = Math.min(delta, 0.05);
    state.elapsed += dt;
    const shot = planCamera({ sim, subjects, line: talk.line, aspect: size.width / size.height,
      elapsed: state.elapsed, shotIndex: state.count, overview, reducedMotion, frame: cameraFrame });
    if (!shot) return;
    aim.current.fromArray(shot.target);
    goal.current.fromArray(shot.position);
    const distantSubject = look.current.distanceTo(aim.current) > 1.6 && camera.position.distanceTo(goal.current) > 3;
    const cut = !ready.current || (changed && (distantSubject || needsCameraCut(camera.position.toArray(), shot)));
    if (cut) {
      camera.position.copy(goal.current);
      look.current.copy(aim.current);
      state.center = shot.centerY;
      ready.current = true;
    } else {
      // No looping camera sway. Reduced-motion mode removes the dolly/orbit and
      // uses a quiet follow instead of snapping to a new position every frame.
      const speed = shot.kind === "tracking" ? 3.6 : 2.6;
      const k = 1 - Math.exp(-dt * speed);
      camera.position.lerp(goal.current, k);
      look.current.lerp(aim.current, k);
      state.center = MathUtils.damp(state.center, shot.centerY, 5, dt);
    }
    if (shot.speaker && shot.heading !== undefined) {
      const actor = sim.actors[shot.speaker]!;
      const dx = camera.position.x - actor.x, dz = camera.position.z - actor.z;
      const offset = MathUtils.clamp(wrapCameraAngle(Math.atan2(dx, dz) - shot.heading), -0.9, 0.9);
      const distance = Math.max(1.4, Math.hypot(dx, dz));
      // Even during a body turn or reverse shot, never linger behind a speaker.
      camera.position.x = actor.x + Math.sin(shot.heading + offset) * distance;
      camera.position.z = actor.z + Math.cos(shot.heading + offset) * distance;
    }
    camera.lookAt(look.current);
    camera.userData.storyFocus = look.current;
    const perspective = camera as PerspectiveCamera;
    perspective.fov = cut ? shot.fov : MathUtils.damp(perspective.fov, shot.fov, 3, dt);
    // Shift the optical center into the space above the actual dialogue panel.
    perspective.setViewOffset(size.width, size.height, 0, size.height * (0.5 - state.center), size.width, size.height);
    const light = sun.current;
    if (light) {
      const [ox, oy, oz] = sunOffset;
      light.position.set(look.current.x + ox, oy, look.current.z + oz);
      light.target.position.set(look.current.x, 0, look.current.z);
      light.target.updateMatrixWorld();
    }
  });
  return null;
}

function Director({ sim, paused }: { sim: Sim; paused: boolean }) {
  useFrame((_state, delta) => { if (!paused) sim.step(Math.min(delta, 0.1)); }, -2);
  return null;
}

function World({ stage, replay, talk, paused, simulation, overview = false, reducedMotion, cameraFrame }: StageProps & { reducedMotion: boolean }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- replay restarts the same stage
  const sim = useMemo(() => simulation ?? createSim(stage), [stage, replay, simulation]);
  const subjects = useMemo<CameraSubjects>(() => Object.fromEntries(Object.values(sim.actors).filter((actor) => !!actor).map((actor) => [actor.id, { heading: actor.heading, lift: 0 }])), [sim]);
  const sun = useRef<DirectionalLight>(null);
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const keep = (event: Event) => event.preventDefault();
    canvas.addEventListener("webglcontextlost", keep);
    return () => canvas.removeEventListener("webglcontextlost", keep);
  }, [gl]);
  const sky = SKY[stage.weather];
  const light = SUN[stage.weather];
  return <>
    <color attach="background" args={[sky]} />
    <fog attach="fog" args={[sky, 24, 70]} />
    <ambientLight intensity={stage.weather === "sunset" ? 0.28 : 0.34} color="#fff1e0" />
    <hemisphereLight args={[stage.weather === "sunset" ? "#ffd9b8" : "#e4f0ef", "#45663c", 1.15]} />
    <directionalLight ref={sun} color={light.color} intensity={light.intensity} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-SHADOW_RANGE} shadow-camera-right={SHADOW_RANGE}
      shadow-camera-top={SHADOW_RANGE} shadow-camera-bottom={-SHADOW_RANGE} shadow-camera-near={0.5}
      shadow-camera-far={60} shadow-normalBias={0.045} shadow-bias={-0.00008} shadow-radius={3} />
    <directionalLight position={[5, 8, -9]} color="#fff2d7" intensity={stage.weather === "rainy" ? 0.6 : 1.2} />
    <Meadow />
    {stage.weather === "rainy" && <Rain sim={sim} />}
    {!simulation && <Director sim={sim} paused={paused} />}
    <CameraDirector sim={sim} subjects={subjects} talk={talk} sun={sun} sunOffset={light.offset} reducedMotion={reducedMotion} overview={overview} paused={paused} cameraFrame={cameraFrame} />
    {(Object.keys(sim.actors) as ActorId[]).map((id) => <CastMember key={id} id={id} sim={sim} talk={talk} cameraSubject={subjects[id]} />)}
    {(Object.keys(sim.props) as PropId[]).map((id) => <PropItem key={id} id={id} sim={sim} />)}
  </>;
}

class StageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <div role="status" style={{ height: "100%", display: "grid", placeItems: "center", background: "linear-gradient(#dce3cb,#829752)", color: "#34462f", padding: 32, textAlign: "center" }}>
        <p>The 3D meadow could not load. You can still enjoy the story and voices below.</p>
      </div>
      : this.props.children;
  }
}

export interface StageProps {
  stage: Stage;
  /** Bump to play the same stage again from the start. */
  replay: number;
  talk: Talk;
  paused: boolean;
  /** Shared speech/action simulation, advanced by the story's playback clock. */
  simulation?: Sim;
  /** Frame the cast to the right of the welcome panel. */
  overview?: boolean;
  /** Fractions of the canvas covered by headers and dialogue/choice panels. */
  cameraFrame?: CameraFrame;
}

export default function TalesStage({ reducedMotion = false, ...props }: StageProps & { reducedMotion?: boolean }) {
  return <StageBoundary>
    <Canvas
      style={{ width: "100%", height: "100%" }} shadows dpr={[1, 1.65]}
      gl={{ antialias: true, alpha: false, powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
      onCreated={({ gl }) => { gl.shadowMap.type = PCFShadowMap; }}
      camera={{ fov: 38, position: [2, 4, 12], near: 0.1, far: 130 }}
      aria-label="Alice and friends acting out the story in Sunny Meadow"
      fallback={<div role="status" style={{ background: "#b6c49a", height: "100%", padding: 32 }}>This device does not support 3D. You can still enjoy the story and character voices.</div>}
    ><World {...props} reducedMotion={reducedMotion} /></Canvas>
  </StageBoundary>;
}
