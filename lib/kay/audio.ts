"use client";

import type { Language, Speaker } from "./types";
import { KAY_VOICES, speechIdentity } from "./voices";

export interface KaySpeech {
  text: string;
  language: Language;
  speaker: Speaker;
}
export interface KaySpeechPlayback extends KaySpeech {
  signal?: AbortSignal;
  onStart?: () => void;
  onEnd?: () => void;
  onFallback?: () => void;
}
interface AudioManifest { clips: Record<string, { src: string; duration?: number }> }
const CACHE_NAME = "alicetales-kay-voices-v1";
const memory = new Map<string, Promise<Blob>>();
let manifest: Promise<AudioManifest> | undefined;
let player: HTMLAudioElement | undefined;
let unlocked = false;
let cancelPlayback: (() => void) | undefined;
let playbackId = 0;

function audioElement() {
  if (!player) {
    player = new Audio();
    player.preload = "auto";
    player.setAttribute("playsinline", "");
  }
  return player;
}

/** Call directly from a tap/click, before awaiting anything (iPad Safari). */
export function unlockKayAudio(): void {
  if (typeof window === "undefined") return;
  const audio = audioElement();
  if (unlocked) return;
  // A short, valid PCM WAV unlocks the same element later used for all speech.
  const bytes = new Uint8Array(844);
  const view = new DataView(bytes.buffer);
  for (const [offset, value] of [[0, "RIFF"], [8, "WAVE"], [12, "fmt "], [36, "data"]] as const) {
    for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i);
  }
  view.setUint32(4, 836, true); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true); view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true); view.setUint16(34, 8, true);
  view.setUint32(40, 800, true); bytes.fill(128, 44);
  const silence = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  audio.src = silence;
  void audio.play().then(() => { unlocked = true; if (audio.src === silence) audio.pause(); }).catch(() => {}).finally(() => URL.revokeObjectURL(silence));
  window.speechSynthesis?.getVoices();
}

export function stopKayAudio(): void {
  playbackId++;
  cancelPlayback?.();
  cancelPlayback = undefined;
  player?.pause();
  window.speechSynthesis?.cancel();
}

async function keyFor(speech: KaySpeech): Promise<string> {
  const data = new TextEncoder().encode(speechIdentity(speech.text, speech.language, speech.speaker));
  const bytes = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function getManifest(): Promise<AudioManifest> {
  manifest ??= fetch("/kay/audio/manifest.json", { cache: "no-cache", signal: AbortSignal.timeout(8000) })
    .then(async (response) => {
      if (!response.ok) throw new Error("Voice library unavailable.");
      return await response.json() as AudioManifest;
    })
    .catch(() => { manifest = undefined; return { clips: {} }; });
  return manifest;
}

async function loadBlob(speech: KaySpeech): Promise<Blob> {
  const key = await keyFor(speech);
  const existing = memory.get(key);
  if (existing) return existing;
  const pending = (async () => {
    const cacheUrl = `${location.origin}/kay/voice-cache/${key}`;
    let cache: Cache | undefined;
    try {
      cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(cacheUrl);
      if (hit) return await hit.blob();
    } catch { /* Private browsing or full storage: playback still works. */ }
    const { clips } = await getManifest();
    const clip = clips?.[key];
    let response: Response;
    if (clip?.src.startsWith("/kay/audio/")) {
      response = await fetch(clip.src, { signal: AbortSignal.timeout(15000) });
    } else {
      response = await fetch("/kay/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: speech.text, language: speech.language, speaker: speech.speaker }),
        signal: AbortSignal.timeout(22000),
      });
    }
    if (!response.ok || !response.headers.get("content-type")?.startsWith("audio/")) {
      throw new Error("Character voice is temporarily unavailable.");
    }
    const blob = await response.blob();
    if (!blob.size) throw new Error("Character voice was empty.");
    try {
      await cache?.put(cacheUrl, new Response(blob, { headers: { "Content-Type": "audio/mpeg" } }));
      // Bound locally generated audio. Cached bundled clips can always be reloaded.
      if (cache) {
        const keys = await cache.keys();
        for (const old of keys.slice(0, Math.max(0, keys.length - 1000))) await cache.delete(old);
      }
    } catch { /* A storage limit must not interrupt a story. */ }
    return blob;
  })();
  memory.set(key, pending);
  if (memory.size > 60) memory.delete(memory.keys().next().value!);
  void pending.catch(() => { if (memory.get(key) === pending) memory.delete(key); });
  return pending;
}

/** Warm only the next few lines; this also persists generated voices on this device. */
export async function preloadKaySpeech(speech: KaySpeech): Promise<void> {
  try { await loadBlob(speech); } catch { /* Playback has its own accessible fallback. */ }
}

/** Resolves on natural completion or cancellation, with start/end tied to audible speech. */
export function playKaySpeech(options: KaySpeechPlayback): Promise<void> {
  stopKayAudio();
  const id = playbackId;
  if (options.signal?.aborted || !options.text.trim()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let finished = false;
    let started = false;
    let fallbackStarted = false;
    let objectUrl: string | undefined;
    let cleanupMedia = () => {};
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const active = () => !finished && id === playbackId && !options.signal?.aborted;
    const clearWatchdog = () => { clearTimeout(watchdog); watchdog = undefined; };
    const guard = (ms: number, callback: () => void) => {
      clearWatchdog();
      const check = () => {
        if (!active()) return;
        // Background tabs can suspend both media events and JS. Never treat that as a failure.
        if (typeof document !== "undefined" && document.hidden) { watchdog = setTimeout(check, 2000); return; }
        callback();
      };
      watchdog = setTimeout(check, ms);
    };
    const start = () => {
      clearWatchdog();
      if (active() && !started) { started = true; options.onStart?.(); }
    };
    const finish = () => {
      if (finished) return;
      finished = true;
      clearWatchdog();
      cleanupMedia();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      options.signal?.removeEventListener("abort", cancel);
      if (cancelPlayback === cancel) cancelPlayback = undefined;
      options.onEnd?.();
      resolve();
    };
    const cancel = () => {
      cleanupMedia();
      player?.pause();
      window.speechSynthesis?.cancel();
      finish();
    };
    cancelPlayback = cancel;
    options.signal?.addEventListener("abort", cancel, { once: true });

    const browserFallback = () => {
      if (!active()) return finish();
      if (fallbackStarted) return;
      fallbackStarted = true;
      clearWatchdog();
      cleanupMedia();
      player?.pause();
      options.onFallback?.();
      const synthesis = window.speechSynthesis;
      if (!synthesis || typeof SpeechSynthesisUtterance === "undefined") { finish(); return; }
      const utterance = new SpeechSynthesisUtterance(options.text);
      utterance.lang = options.language === "ko" ? "ko-KR" : "en-US";
      const voices = synthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith(options.language));
      const voiceIndex = { alice: 0, momo: 1, bori: 2, owl: 3, narrator: 0 }[options.speaker];
      if (voices.length) utterance.voice = voices[voiceIndex % voices.length];
      utterance.pitch = KAY_VOICES[options.speaker].pitch;
      utterance.rate = KAY_VOICES[options.speaker].speed;
      utterance.onstart = () => {
        start();
        // Some device speech engines omit onend after an interruption.
        guard(Math.max(15000, options.text.length * 400), finish);
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      cleanupMedia = () => { utterance.onstart = null; utterance.onend = null; utterance.onerror = null; };
      guard(6000, finish);
      synthesis.speak(utterance);
    };

    void loadBlob(options).then((blob) => {
      if (!active()) return finish();
      const audio = audioElement();
      objectUrl = URL.createObjectURL(blob);
      audio.src = objectUrl;
      audio.onplaying = start;
      audio.onended = finish;
      audio.onerror = browserFallback;
      cleanupMedia = () => { audio.onplaying = null; audio.onended = null; audio.onerror = null; };
      guard(8000, browserFallback);
      void audio.play().catch(browserFallback);
    }).catch(browserFallback);
  });
}
