"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { ACESFilmicToneMapping, MathUtils, PCFShadowMap, Vector3 } from "three";
import type { Group, PerspectiveCamera } from "three";
import type { DialogueLine, Location } from "@/lib/kay/types";
import { ACTOR_POSITIONS, Character, HEADS } from "./three/characters";
import type { Actor } from "./three/characters";
import { Environment, LOCATION_CENTERS } from "./three/environment";

export interface CinemaStageProps {
  line: DialogueLine | null;
  location: Location;
  playing: boolean;
  overview?: boolean;
  reducedMotion?: boolean;
}

/** A continuous 180-degree camera line keeps the characters' screen positions understandable. */
function CameraDirector({ line, location, overview, reducedMotion }: CinemaStageProps) {
  const look = useRef(new Vector3(0, 1, 0));
  const destination = useRef(new Vector3());
  const lookDestination = useRef(new Vector3());
  const initialized = useRef(false);
  const { size } = useThree();
  useFrame(({ camera, clock }, delta) => {
    const center = LOCATION_CENTERS[location];
    const portrait = size.width / size.height < 0.85;
    const speaker = line?.speaker;
    const wide = overview || !speaker || speaker === "narrator";
    const ensemble = line?.action === "dance" || line?.action === "cheer" || line?.action === "offer";
    const drift = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.14) * 0.1;
    const aim = lookDestination.current;
    const pos = destination.current;
    let fov = portrait ? 48 : 39;
    if (wide) {
      aim.set(center[0] - (overview && !portrait ? 2.6 : 0), overview && portrait ? -1.35 : overview ? 0.7 : 1.05, center[2] - 0.3);
      pos.set(center[0] + (overview ? 4.2 : 5.6) + drift, overview ? 3.9 : 4.3, center[2] + (portrait ? 12.8 : 12.0));
      fov = portrait ? 49 : 40;
    } else if (ensemble) {
      aim.set(center[0], 1.05, center[2] - 0.5);
      pos.set(center[0] + (speaker === "momo" ? 2.2 : -2.4) + drift, 2.75, center[2] + (portrait ? 8.8 : 8.6));
      fov = portrait ? 48 : 38;
    } else {
      const actor = speaker as Actor;
      const base = ACTOR_POSITIONS[actor];
      // Close-ups retain ears and hands; the lower frame is intentionally available for subtitles.
      const x = center[0] + base[0], z = center[2] + base[2];
      const side = actor === "kimi" || actor === "owl" ? -1 : 1;
      const height = HEADS[actor];
      aim.set(x + side * 0.08, height - 0.15, z);
      pos.set(x + side * 1.0 + drift, height + 0.45, z + (actor === "kimi" ? 6.4 : 5.7));
      fov = portrait ? 44 : 34;
    }
    if (!initialized.current || reducedMotion) {
      camera.position.copy(pos); look.current.copy(aim); initialized.current = true;
    } else {
      const factor = 1 - Math.exp(-Math.min(delta, 0.05) * 2.0);
      camera.position.lerp(pos, factor); look.current.lerp(aim, factor);
    }
    camera.lookAt(look.current);
    const perspective = camera as PerspectiveCamera;
    perspective.fov = MathUtils.damp(perspective.fov, fov, 2, delta);
    perspective.updateProjectionMatrix();
  });
  return null;
}

function Cast(props: CinemaStageProps) {
  const group = useRef<Group>(null);
  const center = LOCATION_CENTERS[props.location];
  useFrame((_state, delta) => {
    if (!group.current) return;
    const k = props.reducedMotion ? 1 : 1 - Math.exp(-delta * 2.4);
    group.current.position.x = MathUtils.lerp(group.current.position.x, center[0], k);
    group.current.position.z = MathUtils.lerp(group.current.position.z, center[2], k);
  });
  return <group ref={group} position={[...center]}>
    {(["kimi", "momo", "bori", "owl"] as const).map(id => <Character key={id} id={id} line={props.line} playing={props.playing} reducedMotion={props.reducedMotion} />)}
  </group>;
}

function World(props: CinemaStageProps) {
  const { gl } = useThree();
  useEffect(() => {
    const canvas = gl.domElement;
    const onLost = (event: Event) => event.preventDefault();
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [gl]);
  return <>
    <color attach="background" args={["#c5dece"]} />
    <fog attach="fog" args={["#c5dece", 28, 82]} />
    <ambientLight intensity={0.32} color="#fff1e0" />
    <hemisphereLight args={["#e4f0ef", "#45663c", 1.15]} />
    <directionalLight position={[-7, 14, 9]} color="#ffe4c2" intensity={2.8} castShadow
      shadow-mapSize={[2048, 2048]} shadow-camera-left={-20} shadow-camera-right={20}
      shadow-camera-top={20} shadow-camera-bottom={-18} shadow-camera-near={0.5}
      shadow-camera-far={65} shadow-normalBias={0.045} shadow-bias={-0.00008} shadow-radius={3} />
    <directionalLight position={[5, 8, -9]} color="#fff2d7" intensity={1.25} />
    <Environment reducedMotion={props.reducedMotion} />
    <Cast {...props} />
    <CameraDirector {...props} />
  </>;
}

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) return <div role="status" style={{ height: "100%", display: "grid", placeItems: "center", background: "linear-gradient(#dce3cb,#829752)", color: "#34462f", padding: 32, textAlign: "center" }}>
      <p>3D 장면을 불러오지 못했어요. 아래 대사와 음성으로 이야기를 계속 들을 수 있어요.<br />The story and voices are still available below.</p>
    </div>;
    return this.props.children;
  }
}

export default function CinemaStage(props: CinemaStageProps) {
  return <SceneBoundary><Canvas
    style={{ width: "100%", height: "100%" }} shadows dpr={[1, 1.65]}
    gl={{ antialias: true, alpha: false, powerPreference: "high-performance", toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.0 }}
    onCreated={({ gl }) => { gl.shadowMap.type = PCFShadowMap; }}
    camera={{ fov: 40, position: [5.6, 5.5, 12.5], near: 0.1, far: 130 }}
    aria-label="키미와 친구들이 대화하는 햇살 숲속 마을"
    fallback={<div role="status" style={{ background: "#b6c49a", height: "100%", padding: 32 }}>이 기기는 3D를 지원하지 않아요. 대사와 목소리로 이야기를 즐겨주세요.</div>}
  ><World {...props} /></Canvas></SceneBoundary>;
}
