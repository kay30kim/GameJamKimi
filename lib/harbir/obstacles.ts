import type { Point } from "./sim";

/**
 * Solid scenery on the ground, as circles and boxes in meters. These follow the landmark
 * meshes in components/harbir/three/landmarks.tsx; change both together.
 */
export type Obstacle =
  | { kind: "circle"; x: number; z: number; r: number }
  | { kind: "box"; x: number; z: number; hx: number; hz: number };

const circle = (x: number, z: number, r: number): Obstacle => ({ kind: "circle", x, z, r });
const box = (x: number, z: number, hx: number, hz: number): Obstacle => ({ kind: "box", x, z, hx, hz });

export const OBSTACLES: readonly Obstacle[] = [
  box(-6, -5, 1.4, 1.15), // Alice's house
  circle(5, -5, 0.45), // the big tree's trunk
  box(0, -3, 0.95, 0.3), // the bench
  circle(-1.6, -3.5, 0.45), // bushes beside the bench
  circle(1.6, -3.5, 0.42),
  circle(6, 4, 1.6), // the pond, as three overlapping circles
  circle(4.9, 4, 1.1),
  circle(7.1, 4, 1.1),
  box(-6, 3.45, 1.85, 1.1), // the flower bed and its fence
  box(-1.3, 5.2, 0.85, 0.25), // the swings
  box(1.4, 5.1, 0.4, 1.05), // the slide and its tower
  circle(-1.7, 1.2, 0.15), // the signpost
];

/** How far a point is from an obstacle's edge; negative means inside it. */
export function gap(o: Obstacle, x: number, z: number): number {
  if (o.kind === "circle") return Math.hypot(x - o.x, z - o.z) - o.r;
  const dx = Math.abs(x - o.x) - o.hx, dz = Math.abs(z - o.z) - o.hz;
  return Math.hypot(Math.max(dx, 0), Math.max(dz, 0)) + Math.min(Math.max(dx, dz), 0);
}

/** Moves a body of this radius out of every obstacle it overlaps. Returns the point unchanged when clear. */
export function pushOut(x: number, z: number, radius: number): Point {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const o of OBSTACLES) {
      const depth = radius - gap(o, x, z);
      if (depth <= 0) continue;
      // Step out along the direction gap grows fastest.
      const e = 1e-3;
      let nx = gap(o, x + e, z) - gap(o, x - e, z), nz = gap(o, x, z + e) - gap(o, x, z - e);
      const length = Math.hypot(nx, nz);
      if (length < 1e-9) { nx = 1; nz = 0; } else { nx /= length; nz /= length; }
      x += nx * (depth + 1e-3);
      z += nz * (depth + 1e-3);
      moved = true;
    }
    if (!moved) break;
  }
  return [x, z];
}

/** True when a body of this radius can walk straight from a to b without touching scenery. */
export function clearLine(a: Point, b: Point, radius: number): boolean {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const steps = Math.max(1, Math.ceil(length / 0.12));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    for (const o of OBSTACLES) if (gap(o, x, z) < radius - 1e-3) return false;
  }
  return true;
}

/** Points just outside each obstacle that a walker can use to go around it. */
function corners(radius: number): Point[] {
  const out = radius + 0.15;
  const points: Point[] = [];
  for (const o of OBSTACLES) {
    if (o.kind === "box") {
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) points.push([o.x + sx * (o.hx + out), o.z + sz * (o.hz + out)]);
    } else {
      // An octagon around the circle, pushed out far enough that its edges clear it too.
      const r = (o.r + out) / Math.cos(Math.PI / 8);
      for (let i = 0; i < 8; i++) points.push([o.x + Math.cos((i * Math.PI) / 4) * r, o.z + Math.sin((i * Math.PI) / 4) * r]);
    }
  }
  return points.filter(([x, z]) => OBSTACLES.every((o) => gap(o, x, z) >= radius));
}

/**
 * The shortest walk from `from` to `to` around the scenery, as waypoints ending at `to`.
 * Searches the corners of every obstacle that can see each other in a straight line.
 */
export function plan(from: Point, to: Point, radius: number): Point[] {
  if (clearLine(from, to, radius)) return [to];
  const nodes: Point[] = [from, to, ...corners(radius)];
  const n = nodes.length;
  const dist = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v]) continue;
      const step = Math.hypot(nodes[v][0] - nodes[u][0], nodes[v][1] - nodes[u][1]);
      if (dist[u] + step >= dist[v] || !clearLine(nodes[u], nodes[v], radius)) continue;
      dist[v] = dist[u] + step;
      prev[v] = u;
    }
  }
  // No way round (the goal is boxed in): head straight there and let the push-out sort it.
  if (prev[1] < 0) return [to];
  const path: Point[] = [];
  for (let i = 1; i > 0; i = prev[i]) path.unshift(nodes[i]);
  return path;
}
