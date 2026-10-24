import { missingTongues, parseNote } from "./music";
import type { Difficulty, DrumKey, LayoutId, Song } from "./types";

export type LibrarySort = "title" | "difficulty";

export type LibraryQuery = {
  text: string;
  difficulty: Difficulty | "all";
  tags: string[];
  fitsOnly: boolean;
  sort: LibrarySort;
  drumKey: DrumKey;
  layout: LayoutId;
};

const DIFFICULTY_RANK: Record<Difficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};

export function songFitsDrum(song: Song, drumKey: DrumKey, layout: LayoutId): boolean {
  try {
    const notes = song.arrangements[drumKey].lines.flatMap((line) => line.notes.map((note) => parseNote(note)));
    return missingTongues(notes, layout).length === 0;
  } catch {
    return false;
  }
}

function haystack(song: Song): string {
  return `${song.title} ${song.artist} ${(song.tags ?? []).join(" ")}`.toLowerCase();
}

export function filterSongs(songs: Song[], query: LibraryQuery): Song[] {
  const needle = query.text.trim().toLowerCase();
  const visible = songs.filter((song) => {
    if (needle && !haystack(song).includes(needle)) return false;
    if (query.difficulty !== "all" && song.difficulty !== query.difficulty) return false;
    if (query.tags.length > 0 && !query.tags.some((tag) => song.tags?.includes(tag))) return false;
    if (query.fitsOnly && !songFitsDrum(song, query.drumKey, query.layout)) return false;
    return true;
  });
  const sorted = [...visible];
  sorted.sort((a, b) => {
    if (query.sort === "difficulty") {
      const rank = DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty];
      if (rank !== 0) return rank;
    }
    return a.title.localeCompare(b.title, "en", { sensitivity: "base" });
  });
  return sorted;
}

export function collectTags(songs: Song[]): string[] {
  const all = new Set<string>();
  for (const song of songs) for (const tag of song.tags ?? []) all.add(tag);
  return [...all].sort((a, b) => a.localeCompare(b, "en"));
}
