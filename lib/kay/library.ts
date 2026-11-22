"use client";

import type { KayStory } from "./types";
import { parseKayStory } from "./validation";

const KEY = "alicetales-kay-library-v1";
// Read books saved before the rename on this origin; all new saves use Alicetales.
const LEGACY_KEY = "kimi-kay-library-v1";
const CHANGED = "alicetales-kay-library-changed";
const EMPTY: KayStory[] = [];
let serialized: string | null | undefined;
let snapshot: KayStory[] = EMPTY;
let volatile = false;

export const serverLibrary = () => EMPTY;

/** Stable snapshots keep browser-only saved stories out of server hydration. */
export function getKayLibrary(): KayStory[] {
  if (typeof window === "undefined") return EMPTY;
  if (volatile) return snapshot;
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (raw === serialized) return snapshot;
    serialized = raw;
    const data: unknown = JSON.parse(raw ?? "[]");
    const valid: KayStory[] = [];
    if (Array.isArray(data)) {
      for (const item of data.slice(0, 6)) {
        try { valid.push(parseKayStory(item)); } catch { /* Old or damaged books are ignored. */ }
      }
    }
    snapshot = valid;
  } catch { /* Preserve this session's books if browser storage becomes unavailable. */ }
  return snapshot;
}

export function subscribeKayLibrary(notify: () => void) {
  const fromOtherTab = (event: StorageEvent) => { if (event.key === KEY || event.key === LEGACY_KEY || event.key === null) { volatile = false; notify(); } };
  window.addEventListener("storage", fromOtherTab);
  window.addEventListener(CHANGED, notify);
  return () => { window.removeEventListener("storage", fromOtherTab); window.removeEventListener(CHANGED, notify); };
}

/** Keep the book usable in memory even when private browsing blocks persistence. */
export function saveKayLibrary(stories: KayStory[]): boolean {
  snapshot = stories.slice(0, 6);
  let stored = true;
  try {
    const raw = JSON.stringify(snapshot);
    localStorage.setItem(KEY, raw);
    serialized = raw;
    volatile = false;
  } catch { stored = false; volatile = true; }
  window.dispatchEvent(new Event(CHANGED));
  return stored;
}
