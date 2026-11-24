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
import { CastMember, HEAD } from "./bodies";
import type { Talk } from "./bodies";

/** Kay's warm storybook light, with a peach evening and a grey rainy variant. */
const SKY = { sunny: "#c5dece", rainy: "#b4c3c4", sunset: "#f3d5bd" } as const;
const SUN = {
  sunny: { color: "#ffe4c2", intensity: 2.8, offset: [-7, 14, 9] },
  rainy: { color: "#e8eef0", intensity: 1.3, offset: [-7, 14, 9] },
  sunset: { color: "#ffb47a", intensity: 2.6, offset: [-12, 6, 4] },
} as const;
const SHADOW_RANGE = 14;

/** Kay's 180-degree rule: the camera stays on the meadow's front side, so left and right never flip. */
const FRONT = new Vector3(0.22, 0, 1).normalize();

/**
 * Frames whoever the story is about. A speaker and their listener get a two-shot, every third
 * solo line gets a close-up, and otherwise the shot widens to fit the whole cast.
 */
function CameraDirector({ sim, talk, sun, sunOffset, reducedMotion, overview }: { sim: Sim; talk: Talk; sun: React.RefObject<DirectionalLight | null>; sunOffset: readonly [number, number, number]; reducedMotion: boolean; overview: boolean }) {
  const look = useRef(new Vector3(0, 1, 0));
  const aim = useRef(new Vector3());
  const goal = useRef(new Vector3());
  const ready = useRef(false);
  const shots = useRef({ line: null as Talk["line"], count: 0 });
  const { size } = useThree();
  useFrame(({ camera }, delta) => {
    const portrait = size.width / size.height < 0.85;
    const { line } = talk;
    if (shots.current.line !== line) { shots.current.line = line; if (line) shots.current.count += 1; }
    const actors = Object.values(sim.actors).filter((actor) => actor !== undefined);
    if (!actors.length) return;
    const speaker = line && sim.actors[line.speaker];
    const listener = line?.to && sim.actors[line.to];
    let distance: number;
    let height: number;
    let fov = portrait ? 48 : 38;
    if (speaker && listener) {
      aim.current.set((speaker.x + listener.x) / 2, Math.max(HEAD[line.speaker], HEAD[line.to!]) * 0.62, (speaker.z + listener.z) / 2);
      distance = 4.6 + Math.hypot(speaker.x - listener.x, speaker.z - listener.z) * 0.9;
      height = 1.6;
    } else if (speaker && shots.current.count % 3 === 0) {
      aim.current.set(speaker.x, HEAD[line.speaker] * 0.8, speaker.z);
      distance = 3.4;
      height = 1.1;
      fov = portrait ? 44 : 34;
    } else {
      const cx = actors.reduce((sum, a) => sum + a.x, 0) / actors.length;
      const cz = actors.reduce((sum, a) => sum + a.z, 0) / actors.length;
      const spread = Math.max(...actors.map((a) => Math.hypot(a.x - cx, a.z - cz)));
      // On the welcome screen the setup panel covers the left, so the cast stands to the right.
      aim.current.set(cx - (overview && !portrait ? 2.4 : 0), 0.7, cz);
      distance = MathUtils.clamp(6 + spread * 1.6, 6.5, 17);
      height = 1.9 + distance * 0.18;
    }
    if (portrait) distance *= 1.25;
    goal.current.copy(aim.current).addScaledVector(FRONT, distance).setY(aim.current.y + height);
    if (!ready.current || reducedMotion) {
      camera.position.copy(goal.current);
      look.current.copy(aim.current);
      ready.current = true;
    } else {
      const k = 1 - Math.exp(-Math.min(delta, 0.05) * 1.8);
      camera.position.lerp(goal.current, k);
      look.current.lerp(aim.current, k);
    }
    camera.lookAt(look.current);
    const perspective = camera as PerspectiveCamera;
    perspective.fov = MathUtils.damp(perspective.fov, fov, 2, delta);
    perspective.updateProjectionMatrix();
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

function World({ stage, replay, talk, paused, overview = false, reducedMotion }: StageProps & { reducedMotion: boolean }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- replay restarts the same stage
  const sim = useMemo(() => createSim(stage), [stage, replay]);
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
    <Director sim={sim} paused={paused} />
    <CameraDirector sim={sim} talk={talk} sun={sun} sunOffset={light.offset} reducedMotion={reducedMotion} overview={overview} />
    {(Object.keys(sim.actors) as ActorId[]).map((id) => <CastMember key={id} id={id} sim={sim} talk={talk} />)}
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
  /** Frame the cast to the right of the welcome panel. */
  overview?: boolean;
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
