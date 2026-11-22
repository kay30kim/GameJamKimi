/**
 * 3D style tokens for Sunny Meadow. Every mesh in components/harbir/three reads its colors,
 * roughness, and light settings from here, so the world stays consistent.
 * The rules behind these values are in design/3d-style-guide.md.
 * Colors follow Kay's /demo woodland and the designer's character brief.
 */

export const PALETTE = {
  sky: "#dcece6",
  skyRainy: "#bccad0",
  skySunset: "#f3d3b4",

  grass: "#a3c194",
  grassDeep: "#8fb284",
  path: "#e3d3ad",
  clearing: "#ece0c0",
  soil: "#9a7457",
  sand: "#d9c89e",
  water: "#8cc7d8",
  waterDeep: "#6fb0c6",
  stone: "#c9c3b6",

  trunk: "#956c51",
  leaf: "#6c9e76",
  leafLight: "#83ae7b",
  leafWarm: "#93b37a",
  bush: "#5a8b68",
  bushLight: "#729e71",
  stem: "#53815e",
  flowers: ["#f4ce67", "#edac9a", "#e98fb4", "#b9a5e8", "#fffaf0"],

  wood: "#b98251",
  woodDark: "#875a38",
  wall: "#fbe9cf",
  roof: "#d9826b",
  door: "#a2694a",
  glass: "#bfe1f0",
  playBlue: "#8fb8de",
  playYellow: "#e7b458",
  playOrange: "#f2a65a",

  /** Faces: shared by every character, matching Alice's model. */
  eye: "#4b3028",
  sparkle: "#fffaf0",
  cheek: "#efa6a1",

  aliceFur: "#ffefcf",
  aliceScarf: "#f2b49b",
  bearFur: "#b98560",
  bearMuzzle: "#efd7b8",
  bearScarf: "#8fb8de",
  puppyFur: "#f0d0a0",
  puppyEar: "#c99862",
  puppyCollar: "#e98f8f",
  kittenFur: "#f2c08a",
  kittenStripe: "#d9975a",
  kittenBelly: "#fff3e2",
  kittenBow: "#b9a5e8",
  duckDown: "#ffe17a",
  duckWing: "#f7cf5c",
  duckBill: "#f2a65a",
  owlFeather: "#a08b78",
  owlBelly: "#f0e6d6",
  owlShawl: "#c9b3d9",
  gold: "#d9ad4c",
  beak: "#e7b458",

  red: "#df665f",
  rain: "#dbe9f5",
} as const;

/** Matte, soft materials. Only water and glass are shiny. */
export const ROUGHNESS = { matte: 0.95, soft: 0.85, satin: 0.6, shiny: 0.2 } as const;

export const LIGHT = {
  ambient: 0.9,
  hemisphere: { sky: "#fff6e6", ground: "#8fb284", intensity: 1.1 },
  sun: { offset: [8, 14, 6] as const, intensity: 2.4, rainyIntensity: 1.2, color: "#fff4e0" },
  /** Evening: a low, warm sun from the side and a peach sky. */
  sunset: { offset: [12, 5, 3] as const, intensity: 2.6, color: "#ffb47a", sky: "#ffd9b8", ground: "#9a8a6a", ambient: 0.65 },
  shadowRange: 14,
  fog: { near: 26, far: 60 },
} as const;

/**
 * The camera looks down at Alice from above and behind, so the child sees the meadow
 * around Alice, not just Alice.
 */
export const CAMERA = { height: 9.5, distance: 9, fov: 38, lookHeight: 0.8, follow: 2 } as const;
