import type { Song } from "./types";

// Vite generates this index from songs/*.json. Drop in a new file and it is
// picked up on the next dev-server restart or production build.
const modules = import.meta.glob("../../songs/*.json", {
  eager: true,
  import: "default",
}) as Record<string, Song>;

export function loadSongs(): Song[] {
  return Object.values(modules).sort((a, b) => a.title.localeCompare(b.title, "en"));
}

export function findSong(id: string): Song | undefined {
  return loadSongs().find((song) => song.id === id);
}
