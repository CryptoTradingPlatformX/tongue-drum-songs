import type { EditorLine } from "./editor";
import type { SongFile } from "./mySongs";
import type { DrumKey, TimeSignature } from "./types";

export type EditorDraft = {
  id: string;
  updatedAt: string;
  title: string;
  tempo: number;
  timeSignature: TimeSignature;
  drum: DrumKey;
  lines: EditorLine[];
  duration: number;
  dotted: boolean;
  barsPerLine: number;
};

export type StoredSong = {
  updatedAt: string;
  song: SongFile;
};

export interface SongStore {
  list(): Promise<StoredSong[]>;
  get(id: string): Promise<StoredSong | null>;
  put(record: StoredSong): Promise<void>;
  remove(id: string): Promise<void>;
  getDraft(id: string): Promise<EditorDraft | null>;
  putDraft(draft: EditorDraft): Promise<void>;
  removeDraft(id: string): Promise<void>;
}

const LS_KEY = "tongue-drum-my-songs";
const DRAFT_KEY = "tongue-drum-my-song-drafts";
const DB_NAME = "tongue-drum-my-songs";
const DB_STORE = "songs";
const DRAFT_STORE = "drafts";

function byRecent(records: StoredSong[]): StoredSong[] {
  return [...records].sort((left, right) => (left.updatedAt < right.updatedAt ? 1 : left.updatedAt > right.updatedAt ? -1 : 0));
}

export function memoryStore(seed: StoredSong[] = []): SongStore {
  const records = new Map(seed.map((record) => [record.song.id, structuredClone(record)]));
  const drafts = new Map<string, EditorDraft>();
  return {
    async list() {
      return byRecent([...records.values()].map((record) => structuredClone(record)));
    },
    async get(id) {
      const found = records.get(id);
      return found ? structuredClone(found) : null;
    },
    async put(record) {
      records.set(record.song.id, structuredClone(record));
    },
    async remove(id) {
      records.delete(id);
      drafts.delete(id);
    },
    async getDraft(id) {
      const found = drafts.get(id);
      return found ? structuredClone(found) : null;
    },
    async putDraft(draft) {
      drafts.set(draft.id, structuredClone(draft));
    },
    async removeDraft(id) {
      drafts.delete(id);
    },
  };
}

type StorageLike = Pick<Storage, "getItem" | "setItem">;

export function localStorageStore(storage: StorageLike): SongStore {
  const read = (): StoredSong[] => {
    const raw = storage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredSong[];
    return Array.isArray(parsed) ? parsed : [];
  };
  const write = (records: StoredSong[]) => {
    storage.setItem(LS_KEY, JSON.stringify(records));
  };
  return {
    async list() {
      return byRecent(read());
    },
    async get(id) {
      return read().find((record) => record.song.id === id) ?? null;
    },
    async put(record) {
      const records = read().filter((item) => item.song.id !== record.song.id);
      records.push(record);
      write(records);
    },
    async remove(id) {
      write(read().filter((record) => record.song.id !== id));
      const drafts = readDraftsFrom(storage).filter((draft) => draft.id !== id);
      storage.setItem(DRAFT_KEY, JSON.stringify(drafts));
    },
    async getDraft(id) {
      return readDraftsFrom(storage).find((draft) => draft.id === id) ?? null;
    },
    async putDraft(draft) {
      const drafts = readDraftsFrom(storage).filter((item) => item.id !== draft.id);
      drafts.push(draft);
      storage.setItem(DRAFT_KEY, JSON.stringify(drafts));
    },
    async removeDraft(id) {
      storage.setItem(DRAFT_KEY, JSON.stringify(readDraftsFrom(storage).filter((draft) => draft.id !== id)));
    },
  };
}

function readDraftsFrom(storage: StorageLike): EditorDraft[] {
  const raw = storage.getItem(DRAFT_KEY);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as EditorDraft[];
  return Array.isArray(parsed) ? parsed : [];
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export function openIndexedDbStore(factory: IDBFactory): Promise<SongStore> {
  return new Promise((resolve, reject) => {
    const open = factory.open(DB_NAME, 2);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE, { keyPath: "song.id" });
      if (!db.objectStoreNames.contains(DRAFT_STORE)) db.createObjectStore(DRAFT_STORE, { keyPath: "id" });
    };
    open.onerror = () => reject(open.error ?? new Error("IndexedDB failed to open"));
    open.onsuccess = () => {
      const db = open.result;
      const run = async <T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>): Promise<T> => {
        const tx = db.transaction(DB_STORE, mode);
        const store = tx.objectStore(DB_STORE);
        const result = body(store);
        return result instanceof Promise ? result : requestToPromise(result);
      };
      const runDraft = async <T>(mode: IDBTransactionMode, body: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>): Promise<T> => {
        const tx = db.transaction(DRAFT_STORE, mode);
        const store = tx.objectStore(DRAFT_STORE);
        const result = body(store);
        return result instanceof Promise ? result : requestToPromise(result);
      };
      resolve({
        async list() {
          const all = await run<StoredSong[]>("readonly", (store) => store.getAll());
          return byRecent(all);
        },
        async get(id) {
          const found = await run<StoredSong | undefined>("readonly", (store) => store.get(id));
          return found ?? null;
        },
        async put(record) {
          await run("readwrite", (store) => store.put(record));
        },
        async remove(id) {
          await run("readwrite", (store) => store.delete(id));
          await runDraft("readwrite", (store) => store.delete(id));
        },
        async getDraft(id) {
          const found = await runDraft<EditorDraft | undefined>("readonly", (store) => store.get(id));
          return found ?? null;
        },
        async putDraft(draft) {
          await runDraft("readwrite", (store) => store.put(draft));
        },
        async removeDraft(id) {
          await runDraft("readwrite", (store) => store.delete(id));
        },
      });
    };
  });
}

export async function openSongStore(options?: { indexedDB?: IDBFactory; localStorage?: StorageLike }): Promise<SongStore> {
  const idb = options?.indexedDB ?? (typeof indexedDB === "undefined" ? undefined : indexedDB);
  const ls = options?.localStorage ?? (typeof localStorage === "undefined" ? undefined : localStorage);
  const fallback = () => (ls ? localStorageStore(ls) : memoryStore());
  if (!idb) return fallback();
  try {
    const store = await openIndexedDbStore(idb);
    const existing = await store.list();
    if (existing.length === 0 && ls) {
      const leftover = await localStorageStore(ls).list();
      for (const record of leftover) await store.put(record);
    }
    return store;
  } catch {
    return fallback();
  }
}
