"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { Component, Suspense, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { MathUtils, Vector3 } from "three";
import type { DirectionalLight } from "three";
import { createSim } from "@/lib/harbir/sim";
import type { Sim } from "@/lib/harbir/sim";
import { CAMERA, LIGHT, PALETTE } from "@/lib/harbir/style";
import type { ActorId, PropId, Stage } from "@/lib/world";
import { Character, Kimi } from "./three/characters";
import { EmotionBubble, Rain, useEmotionTextures } from "./three/effects";
import { Meadow } from "./three/landmarks";
import { PropItem } from "./three/props";

/**
 * Follows Kimi from above and behind, and keeps the sun's shadow box centered on Kimi,
 * so shadows stay crisp anywhere in the open meadow.
 */
function FollowCamera({ sim, sun, offset }: { sim: Sim; sun: React.RefObject<DirectionalLight | null>; offset: readonly [number, number, number] }) {
  const focus = useRef(new Vector3(0, CAMERA.lookHeight, 0));
  useFrame(({ camera }, delta) => {
    const kimi = sim.actors.hero;
    if (!kimi) return;
    const k = 1 - Math.exp(-delta * CAMERA.follow);
    const target = focus.current;
    target.set(MathUtils.lerp(target.x, kimi.x, k), CAMERA.lookHeight, MathUtils.lerp(target.z, kimi.z, k));
    camera.position.set(target.x, CAMERA.height, target.z + CAMERA.distance);
    camera.lookAt(target);
    const light = sun.current;
    if (light) {
      const [ox, oy, oz] = offset;
      light.position.set(target.x + ox, oy, target.z + oz);
      light.target.position.copy(target);
      light.target.updateMatrixWorld();
    }
  });
  return null;
}

function Director({ sim, paused }: { sim: Sim; paused: boolean }) {
  useFrame((_state, delta) => { if (!paused) sim.step(delta); });
  return null;
}

function World({ stage, paused, replay }: { stage: Stage; paused: boolean; replay: number }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- replay restarts the same stage
  const sim = useMemo(() => createSim(stage), [stage, replay]);
  const textures = useEmotionTextures();
  const sun = useRef<DirectionalLight>(null);
  const rainy = stage.weather === "rainy";
  const sunset = stage.weather === "sunset";
  const sky = rainy ? PALETTE.skyRainy : sunset ? PALETTE.skySunset : PALETTE.sky;
  const evening = LIGHT.sunset;
  const range = LIGHT.shadowRange;
  return (
    <>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, LIGHT.fog.near, LIGHT.fog.far]} />
      <ambientLight intensity={sunset ? evening.ambient : LIGHT.ambient} />
      <hemisphereLight args={[sunset ? evening.sky : LIGHT.hemisphere.sky, sunset ? evening.ground : LIGHT.hemisphere.ground, LIGHT.hemisphere.intensity]} />
      <directionalLight
        ref={sun}
        color={sunset ? evening.color : LIGHT.sun.color}
        intensity={rainy ? LIGHT.sun.rainyIntensity : sunset ? evening.intensity : LIGHT.sun.intensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-range}
        shadow-camera-right={range}
        shadow-camera-top={range}
        shadow-camera-bottom={-range}
        shadow-camera-far={60}
        shadow-normalBias={0.04}
      />
      <Meadow />
      {rainy && <Rain sim={sim} />}
      <Director sim={sim} paused={paused} />
      <FollowCamera sim={sim} sun={sun} offset={sunset ? evening.offset : LIGHT.sun.offset} />
      {sim.actors.hero && <Suspense fallback={null}><Kimi sim={sim} /></Suspense>}
      {(["friend", "puppy", "grownup", "kitten", "duck"] as const).filter((id) => sim.actors[id]).map((id) => <Character key={id} id={id} sim={sim} />)}
      {(Object.keys(sim.props) as PropId[]).map((id) => <PropItem key={id} id={id} sim={sim} />)}
      {(Object.keys(sim.actors) as ActorId[]).map((id) => <EmotionBubble key={id} id={id} sim={sim} textures={textures} />)}
    </>
  );
}

class StageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed
      ? <p role="alert" style={{ padding: 32 }}>The 3D meadow couldn&apos;t load. The story still works below.</p>
      : this.props.children;
  }
}

export default function MeadowStage({ stage, paused = false, replay = 0 }: { stage: Stage; paused?: boolean; replay?: number }) {
  return (
    <StageBoundary>
      <Canvas
        shadows="soft"
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ position: [0, CAMERA.height, CAMERA.distance], fov: CAMERA.fov, near: 0.1, far: 120 }}
        aria-label="Kimi's meadow"
      >
        <World stage={stage} paused={paused} replay={replay} />
      </Canvas>
    </StageBoundary>
  );
}
