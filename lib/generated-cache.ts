import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { get, put } from "@vercel/blob";

export type GeneratedNamespace = "scene" | "tts";
export type GeneratedBackend = "blob" | "disk" | "memory" | "disabled";
const MAX_ENTRY_BYTES = 8 * 1024 * 1024;
const READ_TIMEOUT_MS = 1_500;
const WRITE_TIMEOUT_MS = 1_500;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item ?? null)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** Only opaque hashes reach paths; story text, choices and keys never appear there. */
export function generatedKey(parts: unknown): string {
  return createHash("sha256").update(canonical(parts)).digest("hex");
}

function pathname(namespace: GeneratedNamespace, key: string): string {
  if ((namespace !== "scene" && namespace !== "tts") || !/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid generated cache key");
  return `generated/v1/${namespace}/${key}.${namespace === "scene" ? "json" : "mp3"}`;
}

export interface GeneratedStorage {
  read(path: string, signal: AbortSignal): Promise<Uint8Array | null>;
  write(path: string, bytes: Uint8Array, contentType: string, signal: AbortSignal): Promise<void>;
}

/** Hard deadlines also protect playback if a storage adapter ignores cancellation. */
async function bounded<T>(operation: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      operation(controller.signal),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => { controller.abort(); reject(new Error("Generated cache deadline")); }, ms);
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}

/** Small read-through cache; persistence is separate from the optional memory hot set. */
export function createGeneratedCache(storage: GeneratedStorage | null, options: {
  maxBytes?: number; maxEntries?: number; readTimeoutMs?: number; writeTimeoutMs?: number;
} = {}) {
  const memory = new Map<string, Uint8Array>();
  let size = 0;
  const maxBytes = options.maxBytes ?? 16 * 1024 * 1024;
  const maxEntries = options.maxEntries ?? 128;
  const remember = (path: string, bytes: Uint8Array) => {
    const old = memory.get(path);
    if (old) { size -= old.byteLength; memory.delete(path); }
    if (bytes.byteLength > maxBytes || maxEntries < 1) return;
    memory.set(path, new Uint8Array(bytes));
    size += bytes.byteLength;
    while (size > maxBytes || memory.size > maxEntries) {
      const oldest = memory.keys().next().value!;
      size -= memory.get(oldest)!.byteLength;
      memory.delete(oldest);
    }
  };
  return {
    async read(namespace: GeneratedNamespace, key: string): Promise<Uint8Array | null> {
      try {
        const path = pathname(namespace, key);
        const hot = memory.get(path);
        if (hot) { memory.delete(path); memory.set(path, hot); return new Uint8Array(hot); }
        if (!storage) return null;
        const bytes = await bounded((signal) => storage.read(path, signal), options.readTimeoutMs ?? READ_TIMEOUT_MS);
        if (!bytes?.byteLength || bytes.byteLength > MAX_ENTRY_BYTES) return null;
        remember(path, bytes);
        return new Uint8Array(bytes);
      } catch { return null; }
    },
    async write(namespace: GeneratedNamespace, key: string, bytes: Uint8Array, contentType: string): Promise<boolean> {
      try {
        const path = pathname(namespace, key);
        if (!bytes.byteLength || bytes.byteLength > MAX_ENTRY_BYTES) return false;
        if (contentType !== (namespace === "scene" ? "application/json" : "audio/mpeg")) return false;
        const copy = new Uint8Array(bytes);
        if (!storage) { remember(path, copy); return false; }
        await bounded((signal) => storage.write(path, copy, contentType, signal), options.writeTimeoutMs ?? WRITE_TIMEOUT_MS);
        // A hot hit must not make a failed persistent write look ready to reuse
        // across deployments or processes (especially during offline warmup).
        remember(path, copy);
        return true;
      } catch { return false; }
    },
  };
}

export function diskGeneratedStorage(directory: string): GeneratedStorage {
  return {
    async read(path, signal) {
      const file = join(/* turbopackIgnore: true */ directory, path);
      const info = await stat(/* turbopackIgnore: true */ file);
      if (!info.isFile() || !info.size || info.size > MAX_ENTRY_BYTES) return null;
      return readFile(/* turbopackIgnore: true */ file, { signal });
    },
    async write(path, bytes, _contentType, signal) {
      const file = join(/* turbopackIgnore: true */ directory, path);
      const temporary = `${file}.${randomUUID()}.tmp`;
      try {
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        await writeFile(temporary, bytes, { mode: 0o600, signal });
        signal.throwIfAborted();
        await rename(temporary, file);
      } finally {
        await unlink(temporary).catch(() => {});
      }
    },
  };
}

const blobStorage: GeneratedStorage = {
  async read(path, signal) {
    const result = await get(path, { access: "private", abortSignal: signal });
    if (result?.statusCode !== 200 || !result.stream) return null;
    if (result.blob.size !== null && result.blob.size > MAX_ENTRY_BYTES) { await result.stream.cancel(); return null; }
    const expectedType = path.endsWith(".json") ? "application/json" : "audio/mpeg";
    if (result.blob.contentType?.split(";", 1)[0] !== expectedType) { await result.stream.cancel(); return null; }
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_ENTRY_BYTES) return null;
        chunks.push(value);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      return bytes;
    } finally { await reader.cancel().catch(() => {}); }
  },
  async write(path, bytes, contentType, signal) {
    await put(path, Buffer.from(bytes), {
      access: "private", contentType, addRandomSuffix: false, allowOverwrite: true,
      cacheControlMaxAge: 31_536_000, abortSignal: signal,
    });
  },
};

export function generatedCacheBackend(): GeneratedBackend {
  if (process.env.GENERATED_CACHE_DISABLED === "1") return "disabled";
  if (process.env.BLOB_READ_WRITE_TOKEN?.trim() || process.env.BLOB_STORE_ID?.trim()) return "blob";
  if (process.env.GENERATED_CACHE_DIR?.trim() || (!process.env.VERCEL && process.env.NODE_ENV !== "test")) return "disk";
  return "memory";
}

let activeId = "";
let active = createGeneratedCache(null);
function cache() {
  const backend = generatedCacheBackend();
  if (backend === "disabled") return null;
  // These files are created at runtime, never deployment assets. Excluding the
  // dynamic directory prevents output tracing from bundling the entire project.
  const directory = resolve(/* turbopackIgnore: true */ process.env.GENERATED_CACHE_DIR?.trim() || ".cache");
  const id = generatedKey([backend, directory, process.env.BLOB_STORE_ID, process.env.BLOB_READ_WRITE_TOKEN]);
  if (id !== activeId) {
    activeId = id;
    active = createGeneratedCache(backend === "blob" ? blobStorage : backend === "disk" ? diskGeneratedStorage(directory) : null);
  }
  return active;
}

export async function readGenerated(namespace: GeneratedNamespace, key: string): Promise<Uint8Array | null> {
  return cache()?.read(namespace, key) ?? null;
}

export async function writeGenerated(namespace: GeneratedNamespace, key: string, bytes: Uint8Array, contentType: string): Promise<boolean> {
  return cache()?.write(namespace, key, bytes, contentType) ?? false;
}
