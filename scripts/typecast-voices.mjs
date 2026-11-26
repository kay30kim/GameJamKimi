#!/usr/bin/env node
/** List real Typecast API voices and create a small, local audition. Node 22+. */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const API = "https://api.typecast.ai";
const MODELS = new Set(["ssfm-v31", "ssfm-v30"]);
const REQUEST_TIMEOUT_MS = 30_000;
export const SAMPLES = [
  { file: "01-apple.mp3", title: "한국어 · 사과 따라 말하기", language: "kor", text: "사과. 빨간 사과야. 우리 같이 ‘사과’라고 말해 볼까?" },
  { file: "02-korean-english.mp3", title: "한국어 + 영어 · 표현의 뜻", text: "‘도와줄까?’는 영어로 ‘Can I help?’야. 도와줄까? Can I help?" },
  { file: "03-kindness.mp3", title: "한국어 · 서로 기쁜 마음", language: "kor", happy: true, text: "네가 도와줘서 기분이 좋아졌어. 고마워! 네가 기뻐하니까 나도 기뻐." },
];

const HELP = `Typecast voice auditions (Node 22+)

  node scripts/typecast-voices.mjs list [--all]
  node scripts/typecast-voices.mjs sample --voice <API voice_id> [--output <dir>]

list:   List original child voices. --all includes adult/narrator voices.
sample: Validate a real catalog voice, then generate three MP3 clips.
        Each run creates a fresh directory under tmp/voice-auditions by default.

Requires TYPECAST_API_KEY. TYPECAST_MODEL defaults to ssfm-v31; ssfm-v30 also works.
Existing process environment takes precedence over .env.local.
No keys or role voice IDs are written to your environment files.
`;

export class AuditionError extends Error {}

export function loadLocalEnvironment(cwd = process.cwd()) {
  const filename = join(cwd, ".env.local");
  if (!existsSync(filename)) return;
  if (typeof process.loadEnvFile !== "function") throw new AuditionError("Use Node 22 or newer to load .env.local.");
  const existing = { ...process.env };
  try {
    process.loadEnvFile(filename);
  } catch {
    throw new AuditionError("Could not load .env.local. Check its syntax and file permissions.");
  } finally {
    // Keep exported values, including intentionally empty strings, authoritative.
    Object.assign(process.env, existing);
  }
}

export function parseArgs(args) {
  if (!args.length || (args.length === 1 && ["--help", "-h"].includes(args[0]))) return { command: "help" };
  const [command, ...flags] = args;
  if (!["list", "sample"].includes(command)) throw new AuditionError("Choose list or sample. Use --help for examples.");
  const options = { command, all: false };
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i];
    if (flag === "--all" && command === "list" && !options.all) options.all = true;
    else if (["--voice", "--output"].includes(flag) && command === "sample") {
      const key = flag.slice(2);
      if (options[key] !== undefined || !flags[i + 1] || flags[i + 1].startsWith("--")) {
        throw new AuditionError("Each sample option needs one value and may be supplied only once.");
      }
      options[key] = flags[++i];
    } else throw new AuditionError("Unknown or repeated option. Use --help for supported commands.");
  }
  if (command === "sample" && !/^tc_[A-Za-z0-9_-]{1,128}$/.test(options.voice ?? "")) {
    throw new AuditionError("Use --voice with an exact built-in API voice_id from list. Studio actor IDs are not API voice IDs.");
  }
  return options;
}

function configuration(env) {
  const apiKey = env.TYPECAST_API_KEY?.trim();
  if (!apiKey) throw new AuditionError("Set TYPECAST_API_KEY in .env.local or the process environment. No API request was made.");
  const model = env.TYPECAST_MODEL?.trim() || "ssfm-v31";
  if (!MODELS.has(model)) throw new AuditionError("TYPECAST_MODEL must be ssfm-v31 or ssfm-v30. No API request was made.");
  return { apiKey, model };
}

function httpError(status) {
  const hint = status === 401 || status === 403 ? " Check your API key and account access."
    : status === 402 ? " Check your available credits; this tool does not purchase or upgrade a plan."
      : status === 429 ? " Wait before retrying; no automatic retry was made." : "";
  return new AuditionError(`Typecast request failed (HTTP ${status}).${hint}`);
}

async function request(path, config, fetchImpl, { method = "GET", body } = {}) {
  let response;
  try {
    response = await fetchImpl(`${API}${path}`, {
      method,
      headers: { "X-API-KEY": config.apiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    // Do not expose fetch errors: their message/cause can contain headers or credentials.
    throw new AuditionError("Typecast could not be reached or the request timed out. No automatic retry was made.");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw httpError(response.status);
  }
  return response;
}

function publicVoice(value) {
  if (!value || typeof value.voice_id !== "string" || !Array.isArray(value.models)) {
    throw new AuditionError("Typecast returned an unexpected voice catalog format.");
  }
  const string = (v) => typeof v === "string" ? v : null;
  let preview = null;
  if (typeof value.preview_url === "string") {
    try {
      const url = new URL(value.preview_url);
      if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) preview = url.href;
    } catch { /* A missing or invalid preview does not prevent an audition. */ }
  }
  return {
    voice_id: value.voice_id,
    voice_name: { kor: string(value.voice_name?.kor), eng: string(value.voice_name?.eng) },
    age: string(value.age), gender: string(value.gender), voice_type: string(value.voice_type),
    models: value.models.filter((m) => m && typeof m.version === "string").map((m) => ({
      version: m.version,
      emotions: Array.isArray(m.emotions) ? m.emotions.filter((e) => typeof e === "string") : [],
    })),
    preview_url: preview,
  };
}

export async function listVoices(config, { all = false, fetchImpl = fetch } = {}) {
  const query = new URLSearchParams({ model: config.model, voice_type: "original", ...(!all ? { age: "child" } : {}) });
  const response = await request(`/v3/voices?${query}`, config, fetchImpl);
  let data;
  try { data = await response.json(); } catch { throw new AuditionError("Typecast returned an unreadable voice catalog."); }
  if (!Array.isArray(data)) throw new AuditionError("Typecast returned an unexpected voice catalog format.");
  return data.map(publicVoice).filter((voice) => voice.voice_type === "original" &&
    (all || voice.age === "child") && voice.models.some((m) => m.version === config.model));
}

function sampleRequest(sample, voice, config) {
  const emotions = voice.models.find((m) => m.version === config.model).emotions;
  const emotion = sample.happy && emotions.includes("happy") ? "happy" : "smart";
  return {
    emotion,
    body: {
      voice_id: voice.voice_id, text: sample.text, model: config.model,
      ...(sample.language ? { language: sample.language } : {}),
      prompt: emotion === "happy"
        ? { emotion_type: "preset", emotion_preset: emotion, emotion_intensity: 1 }
        : { emotion_type: "smart" },
      output: { audio_format: "mp3", audio_pitch: 0, audio_tempo: 0.95 },
    },
  };
}

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

export function renderAudition({ voice, model, completed }) {
  const name = voice.voice_name.kor || voice.voice_name.eng || voice.voice_id;
  const cards = SAMPLES.map((sample) => {
    const result = completed.find((item) => item.file === sample.file);
    const status = result ? `${sample.language ? "한국어" : "언어 자동 감지"} · ${result.emotion === "smart" ? "문맥에 맞는 감정" : result.emotion}` : "아직 생성되지 않음";
    return `<section><h2>${escapeHtml(sample.title)}</h2><p class="script">${escapeHtml(sample.text)}</p><p class="status">${escapeHtml(status)}</p>${result ? `<audio controls preload="none" aria-label="${escapeHtml(sample.title)}"><source src="${escapeHtml(sample.file)}" type="audio/mpeg"></audio><a href="${escapeHtml(sample.file)}" download>MP3 저장</a>` : ""}</section>`;
  }).join("\n");
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${escapeHtml(name)} · 목소리 비교</title>
<style>body{margin:0;background:#f7f5ed;color:#264338;font:16px/1.7 system-ui,sans-serif}main{max-width:860px;margin:48px auto;padding:0 22px}h1{font-size:32px;line-height:1.3;margin:8px 0 18px}h2{font-size:19px;margin-top:0}.eyebrow,.status{font-size:13px;color:#607263}section{background:#fffefa;border:1px solid #dbe3d3;border-radius:18px;padding:24px;margin:20px 0}.script{font-size:19px;word-break:keep-all}.note{padding:16px;background:#e8f0e1;border-radius:12px}audio{display:block;width:100%;margin:14px 0}a{color:#365f49;font-size:13px}code{overflow-wrap:anywhere}details{font-size:13px}summary{cursor:pointer}footer{font-size:12px;color:#607263;margin:24px 0}</style></head>
<body><main><p class="eyebrow">Alicetales · 로컬 목소리 비교 · ${completed.length}/3개 생성</p><h1>${escapeHtml(name)}</h1><p class="note">발음이 또렷한지, 어린이 캐릭터에게 어울리는지, 한국어와 영어를 오갈 때 자연스러운지 비교해 보세요. 실제로 들어본 뒤 목소리를 선택하세요.</p><details><summary>음성 설정</summary><p>Voice ID: <code>${escapeHtml(voice.voice_id)}</code><br>Model: <code>${escapeHtml(model)}</code><br>피치 0 · 속도 0.95 · MP3</p></details>
${cards}<footer>오디오는 같은 폴더의 파일만 재생합니다. API 키는 이 페이지에 포함되지 않습니다. 생성 오류가 있었다면 완료된 샘플만 표시됩니다.</footer></main></body></html>\n`;
}

async function sampleAudio(sample, voice, config, fetchImpl) {
  const { body, emotion } = sampleRequest(sample, voice, config);
  const response = await request("/v1/text-to-speech", config, fetchImpl, { method: "POST", body });
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "audio/mpeg" && contentType !== "audio/mp3") {
    await response.body?.cancel().catch(() => {});
    throw new AuditionError("Typecast did not return MP3 audio. No file was saved for this sample.");
  }
  let bytes;
  try { bytes = new Uint8Array(await response.arrayBuffer()); } catch { throw new AuditionError("The audio download failed or timed out. No automatic retry was made."); }
  if (!bytes.length) throw new AuditionError("Typecast returned empty audio. No file was saved for this sample.");
  return { bytes, emotion };
}

export async function runCli(argv, { env = process.env, cwd = process.cwd(), fetchImpl = fetch, log = (text) => process.stdout.write(`${text}\n`) } = {}) {
  const options = parseArgs(argv);
  if (options.command === "help") { log(HELP); return; }
  const config = configuration(env);
  const safeLog = (value) => log(String(value).split(config.apiKey).join("[redacted]"));
  const voices = await listVoices(config, { all: options.command === "sample" || options.all, fetchImpl });
  if (options.command === "list") {
    safeLog(JSON.stringify({ model: config.model, count: voices.length, voices }, null, 2));
    return { voices };
  }
  const voice = voices.find((item) => item.voice_id === options.voice);
  if (!voice) throw new AuditionError("That voice is not in the original-voice catalog for TYPECAST_MODEL. Run list --all and copy an available voice_id. No sample request was made.");
  const outputRoot = resolve(cwd, options.output || "tmp/voice-auditions");
  let directory;
  try {
    await mkdir(outputRoot, { recursive: true });
    directory = await mkdtemp(join(outputRoot, `${voice.voice_id}-`));
  } catch { throw new AuditionError("Could not create the output directory. No sample request was made."); }
  const completed = [];
  const page = join(directory, "index.html");
  const savePage = () => writeFile(page, renderAudition({ voice, model: config.model, completed }), "utf8");
  safeLog(`Generating 3 short samples (${SAMPLES.reduce((sum, sample) => sum + sample.text.length, 0)} characters). This uses API credits; no plan changes are made.`);
  safeLog(`Audition page: ${page}`);
  try {
    // Prove the directory is writable before making a billable request.
    await savePage();
    for (const sample of SAMPLES) {
      const { bytes, emotion } = await sampleAudio(sample, voice, config, fetchImpl);
      await writeFile(join(directory, sample.file), bytes, { flag: "wx" });
      completed.push({ file: sample.file, emotion });
      await savePage();
      safeLog(`Saved ${sample.file} (${completed.length}/3).`);
    }
  } catch (error) {
    if (error instanceof AuditionError) throw error;
    throw new AuditionError("Could not write an audition file. Earlier completed files are preserved; no automatic retry was made.");
  }
  safeLog(`Ready: ${page}`);
  return { directory, page, voice, completed };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (parseArgs(process.argv.slice(2)).command !== "help") loadLocalEnvironment();
    await runCli(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof AuditionError ? error.message : "Voice audition failed. Check the local configuration and try again.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
