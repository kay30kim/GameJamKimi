"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { RefObject } from "react";
import { Quaternion, Vector3 } from "three";
import type { Group } from "three";
import type { Sim } from "@/lib/harbir/sim";
import { PALETTE, ROUGHNESS } from "@/lib/harbir/style";
import type { ActorId, PropId } from "@/lib/world";
import { createGripTransform, getGrip, gripTransform } from "./grips";
import { Blob, Mat } from "./primitives";

// Enough clearance for Alice's ears even at the stretched part of a jump.
const BALLOON_STRING_LENGTH = 1.7;

function PropBody({ id, balloonWeight }: { id: PropId; balloonWeight: RefObject<Group | null> }) {
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
    case "balloon": return (
      // Floats on its string above a small weight, so it reads the same held or tied down.
      <group>
        <group ref={balloonWeight}><Blob position={[0, 0.05, 0]} scale={[0.06, 0.05, 0.06]} color={PALETTE.stone} /></group>
        <mesh position={[0, 0.05 + BALLOON_STRING_LENGTH / 2, 0]}><cylinderGeometry args={[0.006, 0.006, BALLOON_STRING_LENGTH, 4]} /><Mat color={PALETTE.sparkle} /></mesh>
        <Blob position={[0, BALLOON_STRING_LENGTH + 0.22, 0]} scale={[0.26, 0.31, 0.26]} color={PALETTE.flowers[2]} rough={ROUGHNESS.satin} />
        <Blob position={[0, BALLOON_STRING_LENGTH - 0.1, 0]} scale={[0.04, 0.04, 0.04]} color={PALETTE.flowers[2]} rough={ROUGHNESS.satin} shadow={false} />
      </group>
    );
    case "cookies": return (
      <group position={[0, 0.03, 0]}>
        <mesh castShadow><cylinderGeometry args={[0.24, 0.2, 0.04, 20]} /><Mat color={PALETTE.sparkle} /></mesh>
        {[[-0.08, 0.05, -0.05], [0.09, 0.05, -0.03], [0, 0.05, 0.09], [0.01, 0.09, 0.01]].map(([x, y, z], i) => (
          <group key={i} position={[x, y, z]}>
            <mesh><cylinderGeometry args={[0.08, 0.08, 0.03, 14]} /><Mat color={PALETTE.wood} /></mesh>
            {[[-0.03, 0.02], [0.03, -0.01], [0, 0.04]].map(([cx, cz]) => <Blob key={`${cx}${cz}`} position={[cx, 0.018, cz]} scale={[0.012, 0.008, 0.012]} color={PALETTE.woodDark} shadow={false} />)}
          </group>
        ))}
      </group>
    );
    case "watering_can": return (
      <group position={[0, 0.17, 0]}>
        <mesh castShadow><cylinderGeometry args={[0.14, 0.16, 0.32, 16]} /><Mat color={PALETTE.playBlue} rough={ROUGHNESS.satin} /></mesh>
        <mesh position={[0.19, 0.06, 0]} rotation={[0, 0, -0.9]}><cylinderGeometry args={[0.025, 0.035, 0.32, 8]} /><Mat color={PALETTE.playBlue} rough={ROUGHNESS.satin} /></mesh>
        <mesh position={[0.31, 0.16, 0]} rotation={[0, 0, -0.9]}><cylinderGeometry args={[0.05, 0.03, 0.05, 10]} /><Mat color={PALETTE.playBlue} rough={ROUGHNESS.satin} /></mesh>
        <mesh position={[-0.02, 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.1, 0.018, 8, 20, Math.PI]} /><Mat color={PALETTE.playBlue} rough={ROUGHNESS.satin} /></mesh>
      </group>
    );
  }
}

/** Props keep their world size and attach at the animated palm, never the actor's center. */
export function PropItem({ id, sim }: { id: PropId; sim: Sim }) {
  const ref = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const balloonWeight = useRef<Group>(null);
  const last = useRef<[number, number] | null>(null);
  const previous = useRef<{ sim: Sim; holder?: ActorId } | null>(null);
  const blend = useRef(1);
  const target = useMemo(() => createGripTransform(), []);
  const from = useMemo(() => new Vector3(), []);
  const fromRotation = useMemo(() => new Quaternion(), []);
  const rollAxis = useMemo(() => new Vector3(), []);
  useFrame((_state, delta) => {
    const prop = sim.props[id];
    const group = ref.current;
    if (!prop || !group) return;
    const holder = prop.holder ? sim.actors[prop.holder] : undefined;
    if (balloonWeight.current) balloonWeight.current.visible = !holder;
    if (holder) {
      const grip = getGrip(sim, holder.id);
      group.visible = !!grip;
      if (!grip) return;
      gripTransform(grip, id, target);
      if (previous.current?.sim === sim && previous.current.holder !== holder.id) {
        from.copy(group.position);
        fromRotation.copy(group.quaternion);
        blend.current = 0;
      } else if (previous.current?.sim !== sim) blend.current = 1;
      // A short handover arc replaces the old ownership teleport, then locks onto the palm.
      blend.current = Math.min(1, blend.current + Math.min(delta, 0.1) / 0.22);
      const u = blend.current;
      const eased = u * u * (3 - 2 * u);
      group.position.lerpVectors(from, target.position, eased);
      group.position.y += Math.sin(Math.PI * u) * 0.06;
      group.quaternion.slerpQuaternions(fromRotation, target.rotation, eased);
    } else {
      group.visible = true;
      group.position.set(prop.x, 0, prop.z);
      group.rotation.set(0, 0, 0);
      // A rolling ball turns by the distance it covers, around the axis across its path.
      const ball = spin.current;
      const before = last.current;
      if (id === "ball" && ball && before) {
        const dx = prop.x - before[0], dz = prop.z - before[1];
        const moved = Math.hypot(dx, dz);
        if (moved > 1e-4) ball.rotateOnWorldAxis(rollAxis.set(dz / moved, 0, -dx / moved), moved / 0.22);
      }
    }
    previous.current = { sim, holder: prop.holder };
    last.current = [prop.x, prop.z];
  });
  return <group ref={ref}><group ref={spin} position={[0, id === "ball" ? 0.22 : 0, 0]}><group position={[0, id === "ball" ? -0.22 : 0, 0]}><PropBody id={id} balloonWeight={balloonWeight} /></group></group></group>;
}
