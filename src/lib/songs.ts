import { songIndex, type SongSummary } from "virtual:song-index";
import type { Song } from "./types";

export type { SongSummary };

const loaders = import.meta.glob("../../songs/*.json", {
  import: "default",
}) as Record<string, () => Promise<Song>>;

const cache = new Map<string, Promise<Song | null>>();

/** Lightweight list for the library. Note bodies are not included. */
export function songSummaries(): SongSummary[] {
  return [...songIndex].sort((a, b) => a.title.localeCompare(b.title, "en"));
}

function loaderFor(id: string): (() => Promise<Song>) | undefined {
  const suffix = `/${id}.json`;
  const key = Object.keys(loaders).find((file) => file.replaceAll("\\", "/").endsWith(suffix));
  return key ? loaders[key] : undefined;
}

export function loadSong(id: string): Promise<Song | null> {
  const existing = cache.get(id);
  if (existing) return existing;
  const loader = loaderFor(id);
  if (!loader) return Promise.resolve(null);
  const pending = loader()
    .then((song) => (song && song.id === id ? song : null))
    .catch(() => null);
  cache.set(id, pending);
  return pending;
}
