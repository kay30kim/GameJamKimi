"use client";

import { useMemo } from "react";
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";
import type { Texture } from "three";
import { seeded } from "./primitives";

/**
 * Small hand-drawn textures, painted once on a 256px canvas and shared by every mesh.
 * Each one is near-white with soft light and dark marks, so it only shades the
 * material's palette color instead of replacing it. Cheap on the GPU: one tiny
 * image per kind, mipmapped, no extra draw calls.
 */
export type TextureKind = "grass" | "dirt" | "wood" | "bark" | "roof" | "leaves" | "plaster" | "softEdge" | "edgeFade";

const SIZE = 256;
const cache = new Map<TextureKind, Texture>();

type Paint = (ctx: CanvasRenderingContext2D, rand: () => number) => void;

const shade = (value: number, alpha: number) => `rgba(${value},${value},${value},${alpha})`;

function speckle(ctx: CanvasRenderingContext2D, rand: () => number, count: number, size: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = shade(rand() < 0.5 ? 170 : 255, alpha * (0.4 + rand() * 0.6));
    ctx.beginPath();
    ctx.arc(rand() * SIZE, rand() * SIZE, size * (0.4 + rand()), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Draws around the tile edges too, so marks wrap without seams. */
function wrapped(ctx: CanvasRenderingContext2D, draw: () => void) {
  for (const dx of [-SIZE, 0, SIZE]) for (const dy of [-SIZE, 0, SIZE]) {
    ctx.save();
    ctx.translate(dx, dy);
    draw();
    ctx.restore();
  }
}

const PAINTERS: Record<TextureKind, Paint> = {
  grass(ctx, rand) {
    for (let i = 0; i < 40; i++) {
      const x = rand() * SIZE, y = rand() * SIZE, r = 20 + rand() * 40, v = rand() < 0.5 ? 205 : 255;
      wrapped(ctx, () => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, shade(v, 0.18));
        g.addColorStop(1, shade(v, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      });
    }
    ctx.lineCap = "round";
    for (let i = 0; i < 700; i++) {
      const x = rand() * SIZE, y = rand() * SIZE, len = 3 + rand() * 6, lean = (rand() - 0.5) * 4;
      ctx.strokeStyle = shade(rand() < 0.6 ? 175 : 255, 0.35);
      ctx.lineWidth = 1 + rand();
      wrapped(ctx, () => {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + lean, y - len);
        ctx.stroke();
      });
    }
  },
  dirt(ctx, rand) {
    speckle(ctx, rand, 1400, 1.2, 0.5);
    for (let i = 0; i < 40; i++) {
      const x = rand() * SIZE, y = rand() * SIZE, rx = 3 + rand() * 4, ry = 2 + rand() * 3, turn = rand() * Math.PI;
      wrapped(ctx, () => {
        ctx.fillStyle = shade(255, 0.5);
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, turn, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = shade(170, 0.25);
        ctx.beginPath();
        ctx.ellipse(x + 1, y + 1.5, rx, ry * 0.5, 0, 0, Math.PI);
        ctx.fill();
      });
    }
  },
  wood(ctx, rand) {
    for (let y = 0; y < SIZE; y += 5 + rand() * 6) {
      const amp = 1 + rand() * 2, phase = rand() * Math.PI * 2;
      ctx.strokeStyle = shade(rand() < 0.7 ? 150 : 255, 0.4 + rand() * 0.3);
      ctx.lineWidth = 1 + rand() * 1.5;
      ctx.beginPath();
      for (let x = 0; x <= SIZE; x += 8) ctx.lineTo(x, y + Math.sin((x / SIZE) * Math.PI * 4 + phase) * amp);
      ctx.stroke();
    }
    for (let i = 0; i < 3; i++) {
      const x = rand() * SIZE, y = rand() * SIZE;
      ctx.strokeStyle = shade(150, 0.4);
      ctx.beginPath();
      ctx.ellipse(x, y, 9, 4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  },
  bark(ctx, rand) {
    for (let x = 0; x < SIZE; x += 6 + rand() * 8) {
      ctx.strokeStyle = shade(rand() < 0.75 ? 150 : 255, 0.35 + rand() * 0.25);
      ctx.lineWidth = 1.5 + rand() * 2.5;
      ctx.beginPath();
      let px = x;
      for (let y = 0; y <= SIZE; y += 16) {
        px += (rand() - 0.5) * 4;
        ctx.lineTo(px, y);
      }
      ctx.stroke();
    }
  },
  roof(ctx, rand) {
    const rows = 8, h = SIZE / rows, w = SIZE / 8;
    for (let row = 0; row < rows; row++) {
      const offset = row % 2 ? w / 2 : 0;
      for (let col = -1; col <= 8; col++) {
        const x = col * w + offset, y = row * h;
        ctx.fillStyle = shade(rand() < 0.5 ? 235 : 255, 0.5);
        ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
        ctx.strokeStyle = shade(160, 0.55);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, y + h - 1);
        ctx.quadraticCurveTo(x + w / 2, y + h + 4, x + w, y + h - 1);
        ctx.stroke();
      }
    }
  },
  leaves(ctx, rand) {
    for (let i = 0; i < 260; i++) {
      const x = rand() * SIZE, y = rand() * SIZE, r = 4 + rand() * 9, v = rand() < 0.55 ? 185 : 255;
      const alpha = 0.22 + rand() * 0.2, turn = rand() * Math.PI;
      wrapped(ctx, () => {
        ctx.fillStyle = shade(v, alpha);
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.6, turn, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  },
  /** An alpha mask: opaque in the middle, fading to clear at the rim, for soft-edged ground patches. */
  softEdge(ctx) {
    ctx.fillStyle = "black";
    ctx.fillRect(0, 0, SIZE, SIZE);
    const g = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.18, SIZE / 2, SIZE / 2, SIZE / 2);
    g.addColorStop(0, "white");
    g.addColorStop(1, "black");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  },
  /** An alpha mask across a path's width (u): clear at both edges, opaque in the middle. */
  edgeFade(ctx) {
    const g = ctx.createLinearGradient(0, 0, SIZE, 0);
    g.addColorStop(0, "black");
    g.addColorStop(0.14, "white");
    g.addColorStop(0.86, "white");
    g.addColorStop(1, "black");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  },
  plaster(ctx, rand) {
    speckle(ctx, rand, 500, 1.4, 0.18);
    for (let y = 0; y < SIZE; y += 32) {
      ctx.strokeStyle = shade(200, 0.15);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + rand() * 2);
      ctx.lineTo(SIZE, y + rand() * 2);
      ctx.stroke();
    }
  },
};

function paint(kind: TextureKind): Texture {
  const cached = cache.get(kind);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = shade(242, 1);
  ctx.fillRect(0, 0, SIZE, SIZE);
  PAINTERS[kind](ctx, seeded(kind.length * 7919 + kind.charCodeAt(0)));
  const texture = new CanvasTexture(canvas);
  if (kind === "edgeFade") texture.wrapT = RepeatWrapping;
  else if (kind !== "softEdge") {
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.colorSpace = SRGBColorSpace;
  }
  texture.anisotropy = 4;
  cache.set(kind, texture);
  return texture;
}

const tiled = new Map<string, Texture>();

/** A shared texture tiled `repeat` times. Each kind and repeat is made once; clones share the painted image. */
export function useTexture(kind: TextureKind, repeatX = 1, repeatY = repeatX): Texture {
  return useMemo(() => {
    const key = `${kind}:${repeatX}:${repeatY}`;
    let texture = tiled.get(key);
    if (!texture) {
      texture = paint(kind).clone();
      texture.repeat.set(repeatX, repeatY);
      tiled.set(key, texture);
    }
    return texture;
  }, [kind, repeatX, repeatY]);
}
