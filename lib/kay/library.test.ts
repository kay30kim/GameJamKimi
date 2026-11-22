import assert from "node:assert/strict";
import test from "node:test";
import { getKayLibrary, saveKayLibrary } from "./library";
import { STORIES } from "./stories";

test("books saved before the rename retain their story graph and use Alice on the next save", () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const legacy = JSON.parse(JSON.stringify(STORIES[3]).replace(/alice/g, "kimi").replace(/Alice/g, "Kimi").replace(/앨리스/g, "키미"));
  const values = new Map([["kimi-kay-library-v1", JSON.stringify([legacy])]]);
  Object.defineProperty(globalThis, "window", { configurable: true, value: new EventTarget() });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } });
  try {
    const books = getKayLibrary();
    assert.deepEqual(books, [STORIES[3]]);
    assert.equal(getKayLibrary(), books, "snapshots remain stable for React subscriptions");
    assert.equal(saveKayLibrary(books), true);
    const saved = values.get("alicetales-kay-library-v1");
    assert.ok(saved);
    assert.doesNotMatch(saved, /kimi|키미/i);
    assert.deepEqual(JSON.parse(saved), [STORIES[3]]);
    assert.ok(values.has("kimi-kay-library-v1"), "keep the original book as a recovery copy");
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
    if (originalStorage) Object.defineProperty(globalThis, "localStorage", originalStorage);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});
