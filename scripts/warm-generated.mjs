#!/usr/bin/env node
/** Preview a bounded generation plan by default. Explicit --execute makes paid API calls. */
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const HELP = `Warm reusable opening scenes and optional voices

  node scripts/warm-generated.mjs --dry-run
  node scripts/warm-generated.mjs --lesson kindness --age 5 --language ko --dry-run
  node scripts/warm-generated.mjs --lesson kindness --age 5 --language ko --execute --limit 1 --audio

Defaults: 10 preset topics × ages 3–6 × Korean/English = 80 opening scenes.
--openings all includes every opening used by the game; default is first per topic.
--base-url URL defaults to http://127.0.0.1:3000 (run the app first).
--limit N caps the selected plan and is REQUIRED with --execute (maximum 400).
--audio also prepares narration, character lines, words, invitation and praise.
No requests are made without --execute. Generation can use provider credits.
Requests go through the app's private cache. No provider keys are read or printed.
`;

export function parseWarmupArgs(args) {
  const options = { lesson: "all", age: "all", language: "all", openings: "first", baseUrl: "http://127.0.0.1:3000", execute: false, audio: false };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (seen.has(flag)) throw new Error(`Repeated option: ${flag}`);
    seen.add(flag);
    if (flag === "--help" || flag === "-h") return { help: true };
    if (flag === "--execute") options.execute = true;
    else if (flag === "--dry-run") options.dryRun = true;
    else if (flag === "--audio") options.audio = true;
    else if (["--lesson", "--age", "--language", "--openings", "--limit", "--base-url"].includes(flag)) {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value.`);
      options[flag === "--base-url" ? "baseUrl" : flag.slice(2)] = value;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  if (options.execute && options.dryRun) throw new Error("Choose --execute or --dry-run, not both.");
  if (!["all", "3", "4", "5", "6"].includes(options.age)) throw new Error("Age must be 3, 4, 5, 6 or all.");
  if (!["all", "ko", "en"].includes(options.language)) throw new Error("Language must be ko, en or all.");
  if (!["first", "all"].includes(options.openings)) throw new Error("Openings must be first or all.");
  if (options.limit !== undefined && (!/^\d+$/.test(options.limit) || +options.limit < 1 || +options.limit > 400)) throw new Error("Limit must be an integer from 1 to 400.");
  if (options.execute && options.limit === undefined) throw new Error("Add --limit N before executing paid generation.");
  const url = new URL(options.baseUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("Base URL must be an HTTP(S) origin without credentials, path, query or fragment.");
  }
  options.baseUrl = url.origin;
  return options;
}

/** Read literal IDs from the actual runtime guide without executing its source. */
export async function warmupCatalog() {
  const filename = new URL("../lib/lesson-guides.ts", import.meta.url);
  const source = ts.createSourceFile(fileURLToPath(filename), await readFile(filename, "utf8"), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((node) => ts.isIdentifier(node.name) && node.name.text === "LESSON_GUIDES");
  if (!declaration?.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) throw new Error("Could not read the runtime lesson guide.");
  return declaration.initializer.properties.map((property) => {
    if (!ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) throw new Error("Expected a literal lesson guide.");
    const lesson = property.name.getText(source).replace(/^['"]|['"]$/g, "");
    const openings = property.initializer.properties.find((node) => ts.isPropertyAssignment(node) && node.name.getText(source) === "openings");
    if (!openings || !ts.isArrayLiteralExpression(openings.initializer) || !openings.initializer.elements.every(ts.isStringLiteral)) throw new Error(`Could not read openings for ${lesson}.`);
    return { lesson, openings: openings.initializer.elements.map((node) => node.text) };
  });
}

export function warmupPlan(options, catalog) {
  const lessons = options.lesson === "all" ? catalog : catalog.filter(({ lesson }) => lesson === options.lesson);
  if (!lessons.length) throw new Error("Unknown preset lesson. Use a lesson ID from lib/lesson-guides.ts.");
  const ages = options.age === "all" ? [3, 4, 5, 6] : [+options.age];
  const languages = options.language === "all" ? ["ko", "en"] : [options.language];
  const plan = lessons.flatMap(({ lesson, openings }) =>
    ages.flatMap((age) => languages.flatMap((language) => (options.openings === "all" ? openings : openings.slice(0, 1))
      .map((opening) => ({ lesson, age, language, opening, history: [], wordsLearned: [] })))));
  return options.limit === undefined ? plan : plan.slice(0, +options.limit);
}

export function sceneVoiceRequests(scene, language) {
  const lang = language === "ko" ? "ko-KR" : "en-US";
  const normalized = (text) => text.replace(/[\u2026\u22ef]/g, "...");
  const requests = [
    { text: scene.narration, voice: "narrator" },
    ...scene.lines.map(({ text, speaker, emotion }) => ({ text, voice: speaker, ...(emotion ? { emotion } : {}) })),
    ...scene.newWords.map(({ word }) => ({ text: word, voice: "hero", emotion: "happy" })),
  ];
  if (scene.newWords.length) {
    const word = scene.newWords[0].word;
    requests.push({ text: language === "ko" ? `우리 같이 “${word}”라고 말해 볼까?` : `Can you say “${word}” with me?`, voice: "hero", emotion: "happy" });
    requests.push({ text: language === "ko" ? "잘했어!" : "Great job!", voice: "hero", emotion: "happy" });
  }
  return [...new Map(requests.map((item) => {
    const value = { ...item, text: normalized(item.text), lang };
    return [JSON.stringify(value), value];
  })).values()];
}

export async function runWarmup(options, plan, fetcher = fetch, log = console.log) {
  log(JSON.stringify({ mode: options.execute ? "execute" : "dry-run", scenes: plan.length, audio: options.audio, baseUrl: options.baseUrl,
    plan: plan.map(({ lesson, age, language, opening }) => ({ lesson, age, language, opening })) }, null, 2));
  if (!options.execute) return;
  for (const [index, request] of plan.entries()) {
    const response = await fetcher(`${options.baseUrl}/api/scene`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(65_000),
    });
    if (!response.ok || response.headers.get("X-Scene-Mode") !== "kimi") throw new Error(`Scene ${index + 1} was not generated successfully; stopping warmup.`);
    const sceneCache = response.headers.get("X-Scene-Cache")?.toLowerCase();
    const storage = response.headers.get("X-Generated-Storage");
    if ((sceneCache !== "hit" && sceneCache !== "miss") || (storage !== "disk" && storage !== "blob")) {
      throw new Error(`Scene ${index + 1} was generated but not saved. Storage is unconfigured or unavailable; stopping warmup.`);
    }
    const scene = await response.json();
    let audioClips = 0;
    if (options.audio) {
      for (const speech of sceneVoiceRequests(scene, request.language)) {
        const audio = await fetcher(`${options.baseUrl}/api/tts`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(speech), signal: AbortSignal.timeout(65_000),
        });
        if (!audio.ok || !audio.headers.get("content-type")?.startsWith("audio/")) throw new Error(`Voice warmup failed at scene ${index + 1}; stopping.`);
        const audioCache = audio.headers.get("X-Generated-Cache")?.toLowerCase();
        const audioStorage = audio.headers.get("X-Generated-Storage");
        if ((audioCache !== "hit" && audioCache !== "miss") || (audioStorage !== "disk" && audioStorage !== "blob")) {
          throw new Error(`Voice at scene ${index + 1} was generated but not saved. Storage is unconfigured or unavailable; stopping warmup.`);
        }
        if (!(await audio.arrayBuffer()).byteLength) throw new Error("Voice service returned an empty clip.");
        audioClips++;
      }
    }
    log(JSON.stringify({ completed: index + 1, lesson: request.lesson, age: request.age, language: request.language, opening: request.opening,
      sceneCache, storage, audioClips }));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const options = parseWarmupArgs(process.argv.slice(2));
    if (options.help) console.log(HELP);
    else await runWarmup(options, warmupPlan(options, await warmupCatalog()));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Warmup failed.");
    process.exitCode = 1;
  }
}
