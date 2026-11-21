"use client";

import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { Component, Suspense, useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { AnimationMixer, BufferAttribute, CanvasTexture, Group, MathUtils, Points, SRGBColorSpace, Sprite, Vector3 } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createSim } from "@/lib/harbir/sim";
import type { ActorState, Sim } from "@/lib/harbir/sim";
import { SPOTS } from "@/lib/world";
import type { ActorId, Emotion, PropId, Stage } from "@/lib/world";

type Vec3 = [number, number, number];
const at = (spot: keyof typeof SPOTS, y = 0): Vec3 => [SPOTS[spot].position[0], y, SPOTS[spot].position[1]];

function Mat({ color, rough = 0.9 }: { color: string; rough?: number }) {
  return <meshStandardMaterial color={color} roughness={rough} />;
}

function Tree({ position, scale = 1 }: { position: Vec3; scale?: number }) {
  return (
    <group position={position} scale={scale}>
      <mesh position={[0, 0.9, 0]} castShadow><cylinderGeometry args={[0.18, 0.28, 1.8, 8]} /><Mat color="#956c51" /></mesh>
      <mesh position={[0, 2.3, 0]} castShadow><sphereGeometry args={[1, 14, 10]} /><Mat color="#6c9e76" /></mesh>
      <mesh position={[-0.6, 1.9, 0.1]} castShadow><sphereGeometry args={[0.75, 12, 10]} /><Mat color="#83ae7b" /></mesh>
      <mesh position={[0.6, 2, -0.1]} castShadow><sphereGeometry args={[0.7, 12, 10]} /><Mat color="#78a771" /></mesh>
    </group>
  );
}

function House() {
  return (
    <group position={at("home")}>
      <mesh position={[0, 0.9, 0]} castShadow receiveShadow><boxGeometry args={[2.6, 1.8, 2.2]} /><Mat color="#fbe9cf" /></mesh>
      <mesh position={[0, 2.3, 0]} rotation={[0, Math.PI / 4, 0]} castShadow><coneGeometry args={[2.2, 1.2, 4]} /><Mat color="#d9826b" /></mesh>
      <mesh position={[0, 0.55, 1.11]}><boxGeometry args={[0.6, 1.1, 0.04]} /><Mat color="#a2694a" /></mesh>
      <mesh position={[0.8, 1.15, 1.11]}><boxGeometry args={[0.5, 0.5, 0.04]} /><Mat color="#bfe1f0" rough={0.3} /></mesh>
    </group>
  );
}

function Bench() {
  return (
    <group position={at("bench")}>
      <mesh position={[0, 0.45, 0]} castShadow><boxGeometry args={[1.8, 0.1, 0.5]} /><Mat color="#b98251" /></mesh>
      <mesh position={[0, 0.8, -0.22]} castShadow><boxGeometry args={[1.8, 0.45, 0.08]} /><Mat color="#b98251" /></mesh>
      {[-0.75, 0.75].map((x) => <mesh key={x} position={[x, 0.22, 0]}><boxGeometry args={[0.1, 0.45, 0.45]} /><Mat color="#875a38" /></mesh>)}
    </group>
  );
}

function Pond() {
  return (
    <group position={at("pond", 0.02)}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[1.9, 40]} /><Mat color="#c8b98f" /></mesh>
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[1.6, 40]} /><Mat color="#7cc1d9" rough={0.2} /></mesh>
    </group>
  );
}

function Garden() {
  const flowers = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2;
    return { x: Math.cos(angle) * 1.4, z: Math.sin(angle) * 0.9 - 0.6, color: ["#f4ce67", "#edac9a", "#e98fb4", "#b9a5e8"][i % 4] };
  }), []);
  return (
    <group position={at("garden")}>
      <mesh position={[0, 0.01, -0.6]} rotation={[-Math.PI / 2, 0, 0]}><circleGeometry args={[1.7, 32]} /><Mat color="#8a6a4f" /></mesh>
      {flowers.map(({ x, z, color }, i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 0.18, 0]}><cylinderGeometry args={[0.03, 0.03, 0.36, 6]} /><Mat color="#53815e" /></mesh>
          <mesh position={[0, 0.4, 0]}><sphereGeometry args={[0.13, 8, 6]} /><Mat color={color} /></mesh>
        </group>
      ))}
    </group>
  );
}

function Playground() {
  return (
    <group position={at("playground")}>
      <group position={[-1.2, 0, -0.6]}>
        {[-0.7, 0.7].map((x) => <mesh key={x} position={[x, 1, 0]} castShadow><cylinderGeometry args={[0.06, 0.06, 2, 8]} /><Mat color="#e7b458" /></mesh>)}
        <mesh position={[0, 2, 0]}><cylinderGeometry args={[0.06, 0.06, 1.5, 8]} /><Mat color="#e7b458" /></mesh>
        <mesh position={[0, 0.5, 0]} castShadow><boxGeometry args={[0.6, 0.08, 0.3]} /><Mat color="#d9826b" /></mesh>
      </group>
      <group position={[1.3, 0, -0.6]}>
        <mesh position={[0, 0.7, -0.6]} castShadow><boxGeometry args={[0.7, 1.4, 0.7]} /><Mat color="#8fb8de" /></mesh>
        <mesh position={[0, 0.7, 0.45]} rotation={[0.85, 0, 0]} castShadow><boxGeometry args={[0.6, 0.08, 1.8]} /><Mat color="#f2a65a" /></mesh>
      </group>
    </group>
  );
}

function Ground() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[14, 64]} /><Mat color="#9fc28f" /></mesh>
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow><circleGeometry args={[1.8, 32]} /><Mat color="#e3d3ad" /></mesh>
      {(Object.keys(SPOTS) as (keyof typeof SPOTS)[]).filter((spot) => spot !== "path").map((spot) => {
        const [x, z] = SPOTS[spot].position;
        const length = Math.hypot(x, z);
        return (
          <mesh key={spot} position={[x / 2, 0.004, z / 2]} rotation={[-Math.PI / 2, 0, -Math.atan2(z, x)]} receiveShadow>
            <planeGeometry args={[length, 0.9]} />
            <Mat color="#e3d3ad" />
          </mesh>
        );
      })}
      {[[-10, -9, 1.4], [9.5, -9, 1.2], [-11, 1, 1.3], [11, -1, 1.5], [-9, 10, 1.1], [9, 10, 1.3], [0, -11, 1.2]].map(([x, z, s]) => (
        <Tree key={`${x},${z}`} position={[x, 0, z]} scale={s} />
      ))}
    </>
  );
}

const EMOJI: Record<Emotion, string> = { happy: "😊", sad: "😢", surprised: "😮", curious: "🤔", excited: "🤩" };

function useEmotionTextures() {
  return useMemo(() => Object.fromEntries((Object.keys(EMOJI) as Emotion[]).map((emotion) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(64, 60, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "64px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(EMOJI[emotion], 64, 64);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return [emotion, texture];
  })) as Record<Emotion, CanvasTexture>, []);
}

/** Body motion shared by every character: bobbing, hopping, sitting, leaning, waving. */
function applyPose(group: Group, actor: ActorState, sim: Sim) {
  const t = actor.poseTime;
  let y = 0, lean = 0, roll = 0, squash = 1, spin = 0;
  switch (actor.pose) {
    case "walk": y = Math.abs(Math.sin(t * 9)) * 0.08; break;
    case "run": y = Math.abs(Math.sin(t * 15)) * 0.16; lean = 0.15; break;
    case "jump": y = Math.abs(Math.sin(t * Math.PI * 2)) * 0.55; break;
    case "celebrate": y = Math.abs(Math.sin(t * 7)) * 0.4; spin = t * 6; break;
    case "sit": y = -0.12; squash = 0.82; break;
    case "wave": roll = Math.sin(t * 10) * 0.18; break;
    case "hug": case "help": case "reach": lean = 0.32; break;
  }
  if (actor.sitting && actor.pose === "idle") { y = -0.12; squash = 0.82; }
  if (actor.pose === "idle" && !actor.sitting) y = Math.sin(t * 2.2) * 0.02;
  let heading = actor.heading;
  const facing = actor.facing && sim.actors[actor.facing];
  if (facing) heading = Math.atan2(facing.x - actor.x, facing.z - actor.z);
  group.position.set(actor.x, y, actor.z);
  group.rotation.set(lean, heading + spin, roll, "YXZ");
  group.scale.set(1, squash, 1);
}

function Hero({ sim }: { sim: Sim }) {
  const gltf = useLoader(GLTFLoader, "/demo/kimi.glb");
  const outer = useRef<Group>(null);
  const model = useMemo(() => {
    const copy = gltf.scene.clone(true);
    copy.traverse((object) => { object.castShadow = true; });
    return copy;
  }, [gltf]);
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  /** The sim moves Kimi around the world, so drop the clips' own back-and-forth root motion. */
  const clips = useMemo(() => Object.fromEntries(gltf.animations.map((clip) => {
    const limbsOnly = clip.clone();
    limbsOnly.tracks = limbsOnly.tracks.filter((track) => !track.name.endsWith(".position"));
    return [clip.name, limbsOnly];
  })), [gltf]);
  const playing = useRef<string>("");

  useEffect(() => () => { mixer.stopAllAction(); mixer.uncacheRoot(model); }, [mixer, model]);
  useFrame((_state, delta) => {
    const hero = sim.actors.hero;
    if (!hero || !outer.current) return;
    applyPose(outer.current, hero, sim);
    const clip = hero.pose === "walk" || hero.pose === "run" || hero.pose === "celebrate" ? hero.pose : "idle";
    if (clip !== playing.current && clips[clip]) {
      mixer.stopAllAction();
      mixer.clipAction(clips[clip]).reset().fadeIn(0.15).play();
      playing.current = clip;
    }
    mixer.update(Math.min(delta, 0.05));
  });
  return <group ref={outer}><primitive object={model} scale={0.62} dispose={null} /></group>;
}

function BearCub() {
  return (
    <group scale={0.95}>
      <mesh position={[0, 0.5, 0]} castShadow><sphereGeometry args={[0.42, 16, 12]} /><Mat color="#a3714f" /></mesh>
      <mesh position={[0, 1.1, 0]} castShadow><sphereGeometry args={[0.36, 16, 12]} /><Mat color="#a3714f" /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[s * 0.26, 1.38, 0]}><sphereGeometry args={[0.12, 10, 8]} /><Mat color="#8a5c3f" /></mesh>)}
      <mesh position={[0, 1.03, 0.3]}><sphereGeometry args={[0.13, 10, 8]} /><Mat color="#e6c7a5" /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[s * 0.12, 1.17, 0.31]}><sphereGeometry args={[0.04, 8, 6]} /><Mat color="#3b2a22" /></mesh>)}
    </group>
  );
}

function Puppy() {
  return (
    <group scale={0.85}>
      <mesh position={[0, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow><capsuleGeometry args={[0.22, 0.45, 6, 12]} /><Mat color="#e8c48f" /></mesh>
      <mesh position={[0, 0.72, 0.38]} castShadow><sphereGeometry args={[0.25, 14, 10]} /><Mat color="#e8c48f" /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[s * 0.2, 0.7, 0.36]} rotation={[0, 0, s * 0.3]}><capsuleGeometry args={[0.06, 0.18, 4, 8]} /><Mat color="#b88a5a" /></mesh>)}
      <mesh position={[0, 0.68, 0.6]}><sphereGeometry args={[0.06, 8, 6]} /><Mat color="#3b2a22" /></mesh>
      {[[-0.15, 0.2], [0.15, 0.2], [-0.15, -0.2], [0.15, -0.2]].map(([x, z]) => <mesh key={`${x}${z}`} position={[x, 0.12, z]}><cylinderGeometry args={[0.06, 0.06, 0.24, 6]} /><Mat color="#e8c48f" /></mesh>)}
      <mesh position={[0, 0.55, -0.42]} rotation={[-0.8, 0, 0]}><capsuleGeometry args={[0.04, 0.2, 4, 6]} /><Mat color="#b88a5a" /></mesh>
    </group>
  );
}

function GrandmaOwl() {
  return (
    <group>
      <mesh position={[0, 0.75, 0]} scale={[1, 1.25, 0.9]} castShadow><sphereGeometry args={[0.5, 16, 12]} /><Mat color="#8c7b6b" /></mesh>
      <mesh position={[0, 0.65, 0.32]} scale={[1, 1.2, 0.5]}><sphereGeometry args={[0.32, 12, 10]} /><Mat color="#e6dccd" /></mesh>
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.18, 1.12, 0.38]}>
          <mesh><sphereGeometry args={[0.14, 12, 10]} /><Mat color="#fffaf0" /></mesh>
          <mesh position={[0, 0, 0.11]}><sphereGeometry args={[0.06, 8, 6]} /><Mat color="#3b2a22" /></mesh>
          <mesh rotation={[0, 0, 0]}><torusGeometry args={[0.16, 0.015, 6, 20]} /><Mat color="#c79a3c" /></mesh>
        </group>
      ))}
      <mesh position={[0, 1.0, 0.5]} rotation={[Math.PI / 2, 0, 0]}><coneGeometry args={[0.06, 0.15, 6]} /><Mat color="#e7b458" /></mesh>
      {[-1, 1].map((s) => <mesh key={s} position={[s * 0.3, 1.55, 0]} rotation={[0, 0, s * -0.4]}><coneGeometry args={[0.09, 0.3, 6]} /><Mat color="#6f5f51" /></mesh>)}
    </group>
  );
}

const BODIES: Record<Exclude<ActorId, "hero">, () => ReactNode> = { friend: BearCub, puppy: Puppy, grownup: GrandmaOwl };
const HEAD_HEIGHT: Record<ActorId, number> = { hero: 1.75, friend: 1.75, puppy: 1.2, grownup: 1.95 };

function Character({ id, sim }: { id: Exclude<ActorId, "hero">; sim: Sim }) {
  const ref = useRef<Group>(null);
  const Body = BODIES[id];
  useFrame(() => {
    const actor = sim.actors[id];
    if (actor && ref.current) applyPose(ref.current, actor, sim);
  });
  return <group ref={ref}><Body /></group>;
}

function EmotionBubble({ id, sim, textures }: { id: ActorId; sim: Sim; textures: Record<Emotion, CanvasTexture> }) {
  const ref = useRef<Sprite>(null);
  useFrame(() => {
    const actor = sim.actors[id];
    const sprite = ref.current;
    if (!sprite) return;
    sprite.visible = !!actor?.emotion;
    if (!actor?.emotion) return;
    sprite.material.map = textures[actor.emotion];
    sprite.material.needsUpdate = true;
    const pop = Math.min(1, (2.4 - actor.emotionLeft) * 6);
    sprite.scale.setScalar(0.75 * pop);
    sprite.position.set(actor.x, HEAD_HEIGHT[id] + 0.35, actor.z);
  });
  return <sprite ref={ref} visible={false}><spriteMaterial transparent depthTest={false} /></sprite>;
}

function PropBody({ id }: { id: PropId }) {
  switch (id) {
    case "ball": return <mesh castShadow position={[0, 0.2, 0]}><sphereGeometry args={[0.2, 14, 10]} /><Mat color="#e8574f" rough={0.5} /></mesh>;
    case "umbrella": return (
      <group>
        <mesh position={[0, 0.55, 0]}><cylinderGeometry args={[0.02, 0.02, 1.1, 6]} /><Mat color="#555" /></mesh>
        <mesh position={[0, 1.1, 0]} castShadow><coneGeometry args={[0.55, 0.3, 12, 1, true]} /><meshStandardMaterial color="#5f8fe0" side={2} /></mesh>
      </group>
    );
    case "flower": return (
      <group>
        <mesh position={[0, 0.15, 0]}><cylinderGeometry args={[0.02, 0.02, 0.3, 6]} /><Mat color="#53815e" /></mesh>
        <mesh position={[0, 0.33, 0]}><sphereGeometry args={[0.1, 8, 6]} /><Mat color="#e98fb4" /></mesh>
      </group>
    );
    case "apple": return <mesh castShadow position={[0, 0.13, 0]}><sphereGeometry args={[0.13, 12, 10]} /><Mat color="#d6453b" rough={0.4} /></mesh>;
    case "book": return <mesh castShadow position={[0, 0.05, 0]}><boxGeometry args={[0.35, 0.08, 0.26]} /><Mat color="#6b8fd6" /></mesh>;
    case "kite": return (
      <group position={[0, 0.4, 0]} rotation={[0, 0, Math.PI / 4]}>
        <mesh castShadow><boxGeometry args={[0.4, 0.4, 0.02]} /><Mat color="#f2a65a" /></mesh>
      </group>
    );
  }
}

function PropItem({ id, sim }: { id: PropId; sim: Sim }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const prop = sim.props[id];
    const group = ref.current;
    if (!prop || !group) return;
    const holder = prop.holder ? sim.actors[prop.holder] : undefined;
    if (holder) {
      const reach = id === "umbrella" ? 0.15 : 0.45;
      group.position.set(holder.x + Math.sin(holder.heading) * reach, id === "umbrella" ? 0.5 : 0.75, holder.z + Math.cos(holder.heading) * reach);
    } else {
      group.position.set(prop.x, 0, prop.z);
    }
  });
  return <group ref={ref}><PropBody id={id} /></group>;
}

/** Deterministic scatter so rendering stays pure; the drops only need to look random. */
function rainDrops(count: number) {
  const values = new Float32Array(count * 3);
  let seed = 7;
  const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < count; i++) {
    values[i * 3] = (next() - 0.5) * 30;
    values[i * 3 + 1] = next() * 12;
    values[i * 3 + 2] = (next() - 0.5) * 30;
  }
  return values;
}

function Rain() {
  const ref = useRef<Points>(null);
  const positions = useMemo(() => rainDrops(1500), []);
  useFrame((_state, delta) => {
    const attribute = ref.current?.geometry.getAttribute("position") as BufferAttribute | undefined;
    if (!attribute) return;
    const drops = attribute.array as Float32Array;
    for (let i = 1; i < drops.length; i += 3) {
      drops[i] -= delta * 9;
      if (drops[i] < 0) drops[i] += 12;
    }
    attribute.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color="#cfe3f5" size={0.06} transparent opacity={0.8} />
    </points>
  );
}

/** Keeps Kimi in view: the camera drifts after the hero instead of showing the whole meadow at once. */
function FollowCamera({ sim }: { sim: Sim }) {
  const look = useRef(new Vector3(0, 0.8, 0));
  useFrame(({ camera }, delta) => {
    const hero = sim.actors.hero;
    if (!hero) return;
    const k = 1 - Math.exp(-delta * 2);
    camera.position.x = MathUtils.lerp(camera.position.x, hero.x * 0.8, k);
    camera.position.z = MathUtils.lerp(camera.position.z, hero.z + 6.5, k);
    camera.position.y = MathUtils.lerp(camera.position.y, 5.5, k);
    const focus = look.current;
    focus.set(MathUtils.lerp(focus.x, hero.x * 0.9, k), 0.8, MathUtils.lerp(focus.z, hero.z, k));
    camera.lookAt(focus);
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
  const rainy = stage.weather === "rainy";
  const sky = rainy ? "#b7c4cf" : "#cfe8f3";
  return (
    <>
      <color attach="background" args={[sky]} />
      <fog attach="fog" args={[sky, 16, 34]} />
      <ambientLight intensity={rainy ? 1.2 : 1.6} />
      <directionalLight position={[6, 12, 8]} intensity={rainy ? 1.4 : 2.6} castShadow shadow-mapSize={[2048, 2048]} shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14} shadow-normalBias={0.04} />
      <Ground />
      <House />
      <Tree position={at("tree")} scale={1.5} />
      <Bench />
      <Pond />
      <Garden />
      <Playground />
      {rainy && <Rain />}
      <Director sim={sim} paused={paused} />
      <FollowCamera sim={sim} />
      {sim.actors.hero && <Suspense fallback={null}><Hero sim={sim} /></Suspense>}
      {(["friend", "puppy", "grownup"] as const).filter((id) => sim.actors[id]).map((id) => <Character key={id} id={id} sim={sim} />)}
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
      <Canvas shadows dpr={[1, 1.5]} camera={{ position: [0, 5.5, 6.5], fov: 45 }} aria-label="Kimi's meadow">
        <World stage={stage} paused={paused} replay={replay} />
      </Canvas>
    </StageBoundary>
  );
}
