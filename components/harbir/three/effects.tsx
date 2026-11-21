"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import type { BufferAttribute, Points, Sprite } from "three";
import type { Sim } from "@/lib/harbir/sim";
import { PALETTE } from "@/lib/harbir/style";
import type { ActorId, Emotion } from "@/lib/world";
import { HEAD_HEIGHT } from "./characters";
import { seeded } from "./primitives";

const EMOJI: Record<Emotion, string> = { happy: "😊", sad: "😢", surprised: "😮", curious: "🤔", excited: "🤩" };

/** One round bubble texture per feeling, drawn once. */
export function useEmotionTextures() {
  return useMemo(() => Object.fromEntries((Object.keys(EMOJI) as Emotion[]).map((emotion) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = PALETTE.sparkle;
    ctx.shadowColor = "rgba(41, 70, 60, 0.25)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(64, 60, 52, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.font = "64px serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(EMOJI[emotion], 64, 64);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    return [emotion, texture];
  })) as Record<Emotion, CanvasTexture>, []);
}

export function EmotionBubble({ id, sim, textures }: { id: ActorId; sim: Sim; textures: Record<Emotion, CanvasTexture> }) {
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
    sprite.scale.setScalar(0.85 * pop);
    sprite.position.set(actor.x, HEAD_HEIGHT[id] + 0.4, actor.z);
  });
  return <sprite ref={ref} visible={false}><spriteMaterial transparent depthTest={false} /></sprite>;
}

function rainDrops(count: number) {
  const next = seeded(7);
  const values = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    values[i * 3] = (next() - 0.5) * 36;
    values[i * 3 + 1] = next() * 14;
    values[i * 3 + 2] = (next() - 0.5) * 36;
  }
  return values;
}

/** Rain falls in a box that travels with the camera's focus. */
export function Rain({ sim }: { sim: Sim }) {
  const ref = useRef<Points>(null);
  const positions = useMemo(() => rainDrops(2400), []);
  useFrame((_state, delta) => {
    const points = ref.current;
    const attribute = points?.geometry.getAttribute("position") as BufferAttribute | undefined;
    if (!points || !attribute) return;
    const drops = attribute.array as Float32Array;
    for (let i = 1; i < drops.length; i += 3) {
      drops[i] -= delta * 10;
      if (drops[i] < 0) drops[i] += 14;
    }
    attribute.needsUpdate = true;
    const kimi = sim.actors.hero;
    if (kimi) points.position.set(kimi.x, 0, kimi.z);
  });
  return (
    <points ref={ref}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color={PALETTE.rain} size={0.07} transparent opacity={0.85} />
    </points>
  );
}
