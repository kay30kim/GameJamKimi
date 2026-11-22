/**
 * Run: node --experimental-strip-types scripts/generate-kay-audio.mjs --dry-run
 * Then omit --dry-run to prepare the public clips. Resumable; never upgrades billing.
 * Requires the existing ELEVENLABS_API_KEY and ffmpeg on PATH.
 */
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import nextEnv from "@next/env";
import { KAY_VOICES, KAY_AUDIO_VERSION, speechIdentity } from "../lib/kay/voices.ts";
import { STORIES } from "../lib/kay/stories.ts";
import { getGameMoment, practiceFor, practicePrompt, choicePrompt, successPrompt, retryPrompt, defaultPractice } from "../lib/kay/interactions.ts";

nextEnv.loadEnvConfig(process.cwd());
const dryRun = process.argv.includes("--dry-run");
const maxCharacters = Number(process.env.KAY_AUDIO_MAX_CHARACTERS || 60000);
const model = process.env.KAY_TTS_MODEL?.trim() || "eleven_multilingual_v2";
const directory = "public/kay/audio";
const manifestPath = `${directory}/manifest.json`;
const working = join(tmpdir(), "alice-kay-audio-authoring");
await mkdir(directory, { recursive: true });
await mkdir(working, { recursive: true });
let manifest = { version: 1, voiceVersion: KAY_AUDIO_VERSION, clips: {} };
try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); } catch {}
manifest.voiceVersion = KAY_AUDIO_VERSION;
const hash = (value) => createHash("sha256").update(value).digest("hex");
const unique = new Map();
function add(text, language, speaker) {
  const clean = text?.trim().normalize("NFC");
  if (!clean) return;
  const key = hash(speechIdentity(clean, language, speaker));
  unique.set(key, { key, text: clean, language, speaker });
}
for (const story of STORIES) {
  for (const scene of Object.values(story.scenes)) {
    for (const line of scene.lines) {
      for (const language of ["ko", "en"]) {
        add(line.text[language], language, line.speaker);
        if (line.learn) add(line.learn[language], language, line.speaker);
      }
    }
    if (scene.practice) for (const language of ["ko", "en"]) add(scene.practice[language], language, "alice");
    for (const language of ["ko", "en"]) {
      const target = language === "ko" ? "en" : "ko";
      const word = practiceFor(story, scene);
      add(word[language], language, "alice");
      add(practicePrompt(word, language, target), language, "alice");
      for (const choice of scene.choices) add(choice.label[language], language, "alice");
    }
    const moment = getGameMoment(story, scene);
    if (moment) for (const language of ["ko", "en"]) {
      add(moment.question[language], language, "alice");
      for (const choice of moment.choices) {
        add(choice.label[language], language, "alice");
        add(choice.response[language], language, choice.speaker);
      }
    }
  }
}
// The parent-generated stories also reuse these fixed invitations and responses.
const customExample = { ...STORIES[0], id: "custom-example", custom: true };
for (const scene of Object.values(customExample.scenes)) {
  const moment = getGameMoment(customExample, scene);
  if (moment) for (const language of ["ko", "en"]) {
    add(moment.question[language], language, "alice");
    for (const choice of moment.choices) {
      add(choice.label[language], language, "alice");
      add(choice.response[language], language, choice.speaker);
    }
  }
}
for (const language of ["ko", "en"]) {
  for (const text of [choicePrompt, successPrompt, retryPrompt]) add(text[language], language, "alice");
  add(practicePrompt(defaultPractice, language, language === "ko" ? "en" : "ko"), language, "alice");
}
const pending = [];
for (const clip of unique.values()) {
  const prior = manifest.clips[clip.key];
  if (prior?.src) {
    try { await access(`public${prior.src}`); continue; } catch {}
  }
  pending.push(clip);
}
const characters = pending.reduce((sum, clip) => sum + clip.text.length, 0);
console.log(JSON.stringify({ totalClips: unique.size, alreadyPrepared: unique.size - pending.length, pendingClips: pending.length, pendingCharacters: characters, maxCharacters }));
if (dryRun) process.exit(0);
if (characters > maxCharacters) throw new Error(`This run needs ${characters} characters; above the ${maxCharacters}-character authoring cap. No API requests were made.`);
const key = process.env.ELEVENLABS_API_KEY?.trim();
if (!key) throw new Error("Set ELEVENLABS_API_KEY in .env.local. No API requests were made.");
execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });

// Batch the same actor/language with exact character timestamps. This drastically
// reduces authoring requests while each response is split into independent lines.
const groups = new Map();
for (const clip of pending) {
  const group = `${clip.speaker}-${clip.language}`;
  if (!groups.has(group)) groups.set(group, []);
  groups.get(group).push(clip);
}
const batches = [];
for (const clips of groups.values()) {
  let batch = [], length = 0;
  for (const clip of clips) {
    if (length + clip.text.length > 2200 && batch.length) { batches.push(batch); batch = []; length = 0; }
    batch.push(clip); length += clip.text.length + 2;
  }
  if (batch.length) batches.push(batch);
}
let prepared = 0;
for (const batch of batches) {
  const { speaker, language } = batch[0];
  const voice = KAY_VOICES[speaker];
  const voiceId = process.env[`KAY_VOICE_${speaker.toUpperCase()}`]?.trim() || voice.id;
  const text = batch.map((clip) => clip.text).join("\n\n");
  const batchKey = hash(JSON.stringify([text, voiceId, model, voice.speed]));
  const responsePath = join(working, `${batchKey}.json`);
  let generated;
  try { generated = JSON.parse(await readFile(responsePath, "utf8")); } catch {}
  if (!generated) {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.42, similarity_boost: 0.8, style: 0.28, speed: voice.speed, use_speaker_boost: true } }),
      signal: AbortSignal.timeout(120000),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      // Report the stable error code, never a response body or account details.
      throw new Error(`Voice authoring stopped: HTTP ${response.status}, ${error.detail?.status || "provider_error"}. Existing clips are preserved.`);
    }
    generated = await response.json();
    await writeFile(responsePath, JSON.stringify(generated));
  }
  const alignment = generated.alignment;
  if (!alignment || alignment.characters.join("") !== text || !generated.audio_base64) {
    throw new Error(`Timing did not match ${speaker}/${language}; refusing to create incorrectly cut clips. Batch saved locally.`);
  }
  const batchPath = join(working, `${batchKey}.mp3`);
  await writeFile(batchPath, Buffer.from(generated.audio_base64, "base64"));
  let offset = 0;
  const cuts = batch.map((clip, index) => {
    const count = Array.from(clip.text).length;
    const start = Math.max(0, alignment.character_start_times_seconds[offset] - 0.025);
    const end = alignment.character_end_times_seconds[offset + count - 1] + 0.06;
    const duration = Math.max(0.1, end - start);
    const filename = `${clip.speaker}-${clip.language}-${clip.key}.mp3`;
    offset += count + 2;
    return { clip, index, start, end, duration, filename };
  });
  // Decode once per batch, not once per line. Each output is a precise, separately
  // playable MP3; this also avoids hundreds of slow ffmpeg process startups.
  const split = `[0:a]asplit=${cuts.length}${cuts.map(({ index }) => `[split${index}]`).join("")}`;
  const filters = cuts.map(({ index, start, end }) => `[split${index}]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS[out${index}]`);
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", batchPath, "-filter_complex_threads", "1", "-filter_complex", [split, ...filters].join(";")];
  for (const cut of cuts) args.push("-map", `[out${cut.index}]`, "-codec:a", "libmp3lame", "-q:a", "4", "-threads", "1", `${directory}/${cut.filename}`);
  execFileSync("ffmpeg", args, { maxBuffer: 2 * 1024 * 1024 });
  for (const { clip, filename, duration } of cuts) {
    manifest.clips[clip.key] = { src: `/kay/audio/${filename}`, duration: Number(duration.toFixed(3)) };
    prepared++;
  }
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`Prepared ${speaker}/${language}: ${batch.length} clips (${prepared}/${pending.length}).`);
}
const missing = [...unique.keys()].filter((key) => !manifest.clips[key]);
if (missing.length) throw new Error(`${missing.length} required voices are missing.`);
console.log(`Ready: ${unique.size} prerecorded dialogue and practice clips. No runtime generation for the five bundled stories.`);
