"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import { motionOf } from "@/lib/harbir/motion";
import type { Sim } from "@/lib/harbir/sim";
import { PALETTE, ROUGHNESS } from "@/lib/harbir/style";
import type { PropId } from "@/lib/world";
import { HEAD_HEIGHT } from "./characters";
import { Blob, Mat } from "./primitives";

function PropBody({ id }: { id: PropId }) {
  switch (id) {
    case "ball": return (
      <group position={[0, 0.22, 0]}>
        <Blob scale={[0.22, 0.22, 0.22]} color={PALETTE.red} rough={ROUGHNESS.satin} />
        <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.215, 0.035, 8, 32]} /><Mat color={PALETTE.sparkle} rough={ROUGHNESS.satin} /></mesh>
      </group>
    );
    case "umbrella": return (
      <group>
        <mesh position={[0, 0.6, 0]}><cylinderGeometry args={[0.02, 0.02, 1.2, 6]} /><Mat color={PALETTE.woodDark} /></mesh>
        <mesh position={[0, 1.15, 0]} castShadow>
          <sphereGeometry args={[0.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2.4]} />
          <meshStandardMaterial color={PALETTE.playBlue} roughness={ROUGHNESS.soft} side={2} />
        </mesh>
        <Blob position={[0, 1.76, 0]} scale={[0.04, 0.05, 0.04]} color={PALETTE.gold} shadow={false} />
      </group>
    );
    case "flower": return (
      <group>
        <mesh position={[0, 0.17, 0]}><cylinderGeometry args={[0.02, 0.02, 0.34, 6]} /><Mat color={PALETTE.stem} /></mesh>
        {Array.from({ length: 5 }, (_, i) => {
          const a = (i / 5) * Math.PI * 2;
          return <Blob key={i} position={[Math.cos(a) * 0.08, 0.38, Math.sin(a) * 0.08]} scale={[0.07, 0.04, 0.07]} color={PALETTE.flowers[2]} shadow={false} />;
        })}
        <Blob position={[0, 0.39, 0]} scale={[0.05, 0.04, 0.05]} color={PALETTE.flowers[0]} shadow={false} />
      </group>
    );
    case "apple": return (
      <group position={[0, 0.16, 0]}>
        <Blob scale={[0.16, 0.15, 0.16]} color={PALETTE.red} rough={ROUGHNESS.satin} />
        <mesh position={[0, 0.17, 0]} rotation={[0, 0, -0.2]}><cylinderGeometry args={[0.02, 0.025, 0.1, 6]} /><Mat color={PALETTE.trunk} /></mesh>
        <Blob position={[0.07, 0.19, 0]} rotation={[0, 0, -0.5]} scale={[0.08, 0.035, 0.03]} color={PALETTE.leafLight} shadow={false} />
      </group>
    );
    case "book": return (
      <group position={[0, 0.06, 0]}>
        <mesh castShadow><boxGeometry args={[0.4, 0.09, 0.3]} /><Mat color={PALETTE.playBlue} /></mesh>
        <mesh position={[0.01, 0, 0]}><boxGeometry args={[0.38, 0.07, 0.28]} /><Mat color={PALETTE.sparkle} /></mesh>
      </group>
    );
    case "kite": return (
      <group position={[0, 0.45, 0]}>
        <mesh rotation={[0, 0, Math.PI / 4]} scale={[1, 1.3, 1]} castShadow><boxGeometry args={[0.36, 0.36, 0.02]} /><Mat color={PALETTE.playOrange} /></mesh>
        {[0.32, 0.5, 0.68].map((y, i) => <Blob key={y} position={[0, -y, 0]} scale={[0.05, 0.03, 0.02]} color={PALETTE.flowers[i + 1]} shadow={false} />)}
      </group>
    );
  }
}

/** A prop on the ground, or carried in front of whoever holds it. */
export function PropItem({ id, sim }: { id: PropId; sim: Sim }) {
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    const prop = sim.props[id];
    const group = ref.current;
    if (!prop || !group) return;
    const holder = prop.holder ? sim.actors[prop.holder] : undefined;
    if (holder) {
      const reach = id === "umbrella" ? 0.2 : 0.42;
      const lift = id === "umbrella" ? Math.max(0.55, HEAD_HEIGHT[holder.id] - 1) : id === "kite" ? 1.3 : 0.55;
      // Carried things rise and fall with the body, so they stay in hand through a hop.
      const hop = motionOf(holder, clock.elapsedTime).lift;
      group.position.set(holder.x + Math.sin(holder.heading) * reach, lift + hop, holder.z + Math.cos(holder.heading) * reach);
      group.rotation.y = holder.heading;
    } else {
      group.position.set(prop.x, 0, prop.z);
    }
  });
  return <group ref={ref}><PropBody id={id} /></group>;
}
