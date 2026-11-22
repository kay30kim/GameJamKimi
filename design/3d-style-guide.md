# Sunny Meadow 3D style guide

Every story happens in one place, Sunny Meadow. These rules keep everything in it looking like it belongs together: the characters, the props, and the landmarks. The values live in `lib/harbir/style.ts`; this page explains them.

## Look and feel

- **Soft storybook toy.** Everything looks like a rounded felt or clay toy. No sharp corners, no realistic textures, no outlines.
- **Matte.** Use roughness 0.85 to 1 (`ROUGHNESS.soft` or `ROUGHNESS.matte`). Only water and window glass are shiny.
- **Pastel, warm, low contrast.** Use only colors from `PALETTE`. To add a color, add it to `PALETTE` first, close in tone to its neighbors.
- **No text in the world.** Words appear in the story panel, never on signs or objects, so the world works in English and Korean.

## Scale

- One unit is one meter. The meadow is flat and open; spots from `lib/world.ts` sit within 8 m of the center.
- Characters are 1.2 to 1.7 m tall, with big heads: the head is about as wide as the body.
- Props are child-sized and readable from the high camera: at least 0.25 m across.

## Building shapes

Build everything from a few primitives, the same way Alice's model is made in `scripts/build-demo-model.mjs`:

- **Blob:** a sphere scaled into an ellipsoid. Bodies, heads, ears, paws, muzzles, bushes, and tree crowns are blobs.
- **Capsule or cylinder:** legs, trunks, posts, and handles.
- **Box with soft colors:** buildings, benches, and books only.

Use the `Blob` and `Mat` helpers in `components/harbir/three/primitives.tsx`.

## Faces

Every character uses the same face recipe (`Face` in `primitives.tsx`), copied from Alice's model:

- Two dark brown oval eyes (`PALETTE.eye`), each with a small white sparkle up and to the left.
- Two pink oval cheeks (`PALETTE.cheek`) below and outside the eyes.
- A small nose and a tiny dark mouth.
- Eyes sit just below the middle of the head. Big eyes and a low face read as young and friendly.

Feelings show as an emoji bubble over the head, not by changing the face, so every face stays simple.

## Characters

Each character wears one accessory in a distinct color, so children can tell them apart from far away:

| Character | Body | Accessory |
| --- | --- | --- |
| Alice the bunny | Cream fur, long ears | Peach scarf |
| Momo the bear cub | Warm brown, round ears, light muzzle | Blue scarf |
| Bori the puppy | Honey fur, floppy darker ears | Pink collar |
| Grandma Owl | Soft brown feathers, light belly, ear tufts | Lilac shawl and gold glasses |

Characters have named arm and leg groups, so the engine can swing them when walking, raise an arm to wave, and reach forward to hug or give.

## Light and camera

- A warm sun from the upper right with soft shadows, plus sky light. Rain dims the sun and turns the sky gray-blue.
- Fog fades the far meadow into the sky color, so the world has no visible edge.
- The camera looks down from above and behind Alice and follows Alice smoothly (`CAMERA`). Keep the view high: children should see where Alice is in the meadow.

## Adding something new

1. Add its name to `lib/world.ts`, so the story model can use it.
2. Build it from blobs in the matching file under `components/harbir/three/`: `characters.tsx`, `props.tsx`, or `landmarks.tsx`.
3. Use only `PALETTE` colors, give characters the shared `Face`, and keep sizes within the scale above.
