import { BufferGeometry, CatmullRomCurve3, Float32BufferAttribute, Vector3 } from "three";
import { seeded } from "./primitives";

/**
 * Sunny Meadow's footpaths, as hand-placed control points [x, z] in meters.
 * A village loop winds past the front of every landmark, one short trail crosses the green,
 * and a few trails wander off into the fog so the meadow feels like part of a bigger world.
 * Landmark positions live in lib/world.ts; the loop is drawn to pass just in front of each one.
 */
type Trail = { points: [number, number][]; closed: boolean; width: number; fade: boolean };

export const TRAILS: Trail[] = [
  {
    closed: true,
    width: 1.35,
    fade: false,
    points: [
      [-6, -2.4], [-3.4, -1.1], [0, -0.5], [3, -1.6], [5.2, -3.1], [7.6, -1.2], [9.2, 2.4],
      [7.4, 7], [3.4, 8.7], [0, 8.7], [-3.4, 8.2], [-6, 6.5], [-8.4, 3], [-8.6, -0.8],
    ],
  },
  { closed: false, width: 1, fade: false, points: [[0, -0.5], [0.9, 1.3], [0.3, 2.9]] },
  { closed: false, width: 1, fade: true, points: [[9.2, 2.4], [13, 1.4], [18, 3.2], [24, 1.2], [32, 2.8]] },
  { closed: false, width: 1, fade: true, points: [[-8.6, -0.8], [-13, -3.6], [-18, -2.8], [-25, -6.5], [-32, -6]] },
  { closed: false, width: 1, fade: true, points: [[3, -1.6], [2.4, -4.2], [2.9, -8], [1, -13], [2, -20], [0, -28]] },
  { closed: false, width: 1, fade: true, points: [[0, 8.7], [-1, 12], [1, 17], [-1.2, 24], [0, 32]] },
];

const STEP = 0.25;

type Sample = { x: number; z: number; half: number; nx: number; nz: number };

function sampleTrail(trail: Trail, seed: number): Sample[] {
  const curve = new CatmullRomCurve3(trail.points.map(([x, z]) => new Vector3(x, 0, z)), trail.closed, "centripetal");
  const count = Math.max(2, Math.ceil(curve.getLength() / STEP));
  const samples: Sample[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const p = curve.getPointAt(t);
    const tangent = curve.getTangentAt(t);
    const d = t * count * STEP;
    const wobble = 1 + 0.1 * Math.sin(d * 1.3 + seed) + 0.06 * Math.sin(d * 3.1 + seed * 2);
    const taper = trail.fade ? 1 - 0.45 * t : 1;
    samples.push({ x: p.x, z: p.z, half: (trail.width / 2) * wobble * taper, nx: -tangent.z, nz: tangent.x });
  }
  return samples;
}

export const SAMPLES: Sample[][] = TRAILS.map((trail, i) => sampleTrail(trail, i * 1.7));

/** A flat strip along the samples. u runs across the path (0 to 1), v runs along it, one unit per 1.5 m. */
export function ribbonGeometry(samples: Sample[]): BufferGeometry {
  const positions: number[] = [], uvs: number[] = [], normals: number[] = [], index: number[] = [];
  samples.forEach(({ x, z, half, nx, nz }, i) => {
    const v = (i * STEP) / 1.5;
    positions.push(x + nx * half, 0, z + nz * half, x - nx * half, 0, z - nz * half);
    uvs.push(0, v, 1, v);
    normals.push(0, 1, 0, 0, 1, 0);
    if (i > 0) {
      const a = (i - 1) * 2;
      index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("normal", new Float32BufferAttribute(normals, 3));
  geometry.setIndex(index);
  return geometry;
}

/** How far (x, z) is from the nearest path edge; negative means on the path. */
export function pathClearance(x: number, z: number): number {
  let best = Infinity;
  for (const trail of SAMPLES) {
    for (const s of trail) {
      const dx = x - s.x, dz = z - s.z;
      if (Math.abs(dx) > best + 1 || Math.abs(dz) > best + 1) continue;
      best = Math.min(best, Math.hypot(dx, dz) - s.half);
    }
  }
  return best;
}

type Point = { x: number; z: number; s: number; r: number };

/** Sparse grass tufts and pebbles just outside the path edges, so paths blend into the meadow. */
export function pathEdges(): { tufts: Point[]; pebbles: Point[] } {
  const next = seeded(61);
  const tufts: Point[] = [], pebbles: Point[] = [];
  for (const samples of SAMPLES) {
    for (let i = 0; i < samples.length; i += 1 + Math.floor(next() * 3)) {
      const { x, z, half, nx, nz } = samples[i];
      if (Math.hypot(x, z) > 26) continue;
      const side = next() < 0.5 ? -1 : 1;
      const off = side * (half * 0.85 + next() * 0.3);
      const px = x + nx * off, pz = z + nz * off;
      if (pathClearance(px, pz) < -half * 0.2) continue;
      (next() < 0.2 ? pebbles : tufts).push({ x: px, z: pz, s: 0.55 + next() * 0.5, r: next() * Math.PI * 2 });
    }
  }
  return { tufts, pebbles };
}
