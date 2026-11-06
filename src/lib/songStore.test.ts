import { describe, expect, it } from "vitest";
import type { SongFile } from "./mySongs";
import { localStorageStore, memoryStore, openIndexedDbStore, openSongStore, type StoredSong } from "./songStore";

function song(id: string): SongFile {
  return {
    schemaVersion: 1,
    id,
    title: id,
    artist: "You",
    source: { name: "On this device", url: "https://local.invalid/my-songs" },
    license: "personal",
    attribution: "Created by you",
    difficulty: "easy",
    tempo: 100,
    timeSignature: "4/4",
    arrangements: {
      C: { minLayout: "8", lines: [{ notes: [{ deg: 1, oct: 0, dur: 4 }] }] },
      D: { minLayout: "8", lines: [{ notes: [{ deg: 1, oct: 0, dur: 4 }] }] },
    },
    verified: false,
  };
}

function record(id: string, updatedAt: string): StoredSong {
  return { updatedAt, song: song(id) };
}

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(key: string) {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
}

function done<T>(result: T): IDBRequest<T> {
  const request = {} as IDBRequest<T>;
  queueMicrotask(() => {
    Object.defineProperty(request, "result", { value: result });
    request.onsuccess?.(new Event("success"));
  });
  return request;
}

function fakeIndexedDB(): IDBFactory {
  const databases = new Map<string, Map<string, Map<string, unknown>>>();
  return {
    open(name: string) {
      const request = {} as IDBOpenDBRequest;
      const stores = databases.get(name) ?? new Map<string, Map<string, unknown>>();
      databases.set(name, stores);
      const db = {
        objectStoreNames: { contains: (storeName: string) => stores.has(storeName) },
        createObjectStore(storeName: string) {
          stores.set(storeName, new Map());
        },
        transaction(storeName: string) {
          const map = stores.get(storeName);
          if (!map) throw new Error(`missing ${storeName}`);
          return {
            objectStore: () => ({
              getAll: () => done([...map.values()]),
              get: (key: string) => done(map.get(key)),
              put: (value: StoredSong) => {
                map.set(value.song.id, structuredClone(value));
                return done(value.song.id);
              },
              delete: (key: string) => {
                map.delete(key);
                return done(undefined);
              },
            }),
          };
        },
      };
      queueMicrotask(() => {
        Object.defineProperty(request, "result", { value: db });
        if (!stores.has("songs")) request.onupgradeneeded?.(new Event("upgradeneeded") as IDBVersionChangeEvent);
        request.onsuccess?.(new Event("success"));
      });
      return request;
    },
  } as unknown as IDBFactory;
}

describe("song storage", () => {
  it("keeps songs in memory", async () => {
    const store = memoryStore();
    expect(await store.list()).toEqual([]);
    await store.put(record("my-a", "2026-01-01T00:00:00.000Z"));
    await store.put(record("my-b", "2026-02-01T00:00:00.000Z"));
    await store.put(record("my-a", "2026-03-01T00:00:00.000Z"));
    expect((await store.list()).map((item) => item.song.id)).toEqual(["my-a", "my-b"]);
    expect((await store.get("my-a"))?.song.title).toBe("my-a");
    await store.remove("my-b");
    expect(await store.get("my-b")).toBeNull();
  });

  it("falls back to localStorage", async () => {
    const storage = new MemoryStorage();
    const store = localStorageStore(storage);
    await store.put(record("my-local", "2026-01-02T00:00:00.000Z"));
    const reopened = localStorageStore(storage);
    expect((await reopened.list()).map((item) => item.song.id)).toEqual(["my-local"]);
    await reopened.remove("my-local");
    expect(await reopened.list()).toEqual([]);
  });

  it("uses IndexedDB and copies leftover localStorage songs once", async () => {
    const storage = new MemoryStorage();
    await localStorageStore(storage).put(record("my-old", "2026-01-03T00:00:00.000Z"));
    const factory = fakeIndexedDB();
    const idb = await openIndexedDbStore(factory);
    await idb.put(record("my-new", "2026-04-01T00:00:00.000Z"));
    expect((await idb.get("my-new"))?.song.id).toBe("my-new");
    await idb.remove("my-new");
    expect(await idb.list()).toEqual([]);

    const opened = await openSongStore({ indexedDB: fakeIndexedDB(), localStorage: storage });
    expect((await opened.list()).map((item) => item.song.id)).toEqual(["my-old"]);
  });

  it("saves and restores an editor draft", async () => {
    const store = memoryStore();
    await store.putDraft({
      id: "my-draft",
      updatedAt: "2026-05-02T00:00:00.000Z",
      title: "Untitled song",
      tempo: 96,
      timeSignature: "3/4",
      drum: "D",
      lines: [{ lyric: "", notes: [{ deg: 1, oct: 0, dur: 1 }] }],
      duration: 1,
      dotted: false,
      barsPerLine: 0,
    });
    expect((await store.getDraft("my-draft"))?.title).toBe("Untitled song");
    await store.removeDraft("my-draft");
    expect(await store.getDraft("my-draft")).toBeNull();
  });

  it("uses localStorage when IndexedDB cannot open", async () => {
    const storage = new MemoryStorage();
    const factory = {
      open() {
        const request = {} as IDBOpenDBRequest;
        queueMicrotask(() => request.onerror?.(new Event("error")));
        return request;
      },
    } as unknown as IDBFactory;
    const opened = await openSongStore({ indexedDB: factory, localStorage: storage });
    await opened.put(record("my-fallback", "2026-05-01T00:00:00.000Z"));
    expect(storage.getItem("tongue-drum-my-songs")).toContain("my-fallback");
  });
});
