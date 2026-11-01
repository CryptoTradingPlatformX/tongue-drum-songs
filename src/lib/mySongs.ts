import { generateArrangement, PERSONAL_ATTRIBUTION, PERSONAL_SOURCE, tongueLabel } from "./arrangements";
import type { EditorState } from "./editor";
import { validateSongDocument, type SongFailure } from "./validateSong";
import type { Arrangement, Difficulty, DrumKey, LayoutId, License, SongLine, TimeSignature } from "./types";

export type UnavailableArrangement = { unavailable: { notes: string[] } };
export type ArrangementFile = Arrangement | UnavailableArrangement;

export type SongFile = {
  schemaVersion: 1;
  id: string;
  title: string;
  artist: string;
  source: { name: string; url: string };
  license: License;
  attribution: string;
  difficulty: Difficulty;
  tags?: string[];
  tempo: number;
  timeSignature: TimeSignature;
  arrangements: { C: ArrangementFile; D: ArrangementFile };
  arrangerNotes?: string;
  verified: boolean;
};

export function isPlayable(arrangement: ArrangementFile): arrangement is Arrangement {
  return "lines" in arrangement && Array.isArray(arrangement.lines);
}

export function playableDrum(song: SongFile): DrumKey {
  if (isPlayable(song.arrangements.C)) return "C";
  return "D";
}

function toFile(generated: ReturnType<typeof generateArrangement>): ArrangementFile | null {
  if (generated.status === "empty") return null;
  if (generated.status === "unavailable") {
    const notes = generated.outOfRange.map((tongue) => tongueLabel(tongue));
    if (notes.length === 0) return null;
    return { unavailable: { notes } };
  }
  return { minLayout: generated.minLayout, lines: generated.lines };
}

export function buildPersonalSong(state: EditorState, id: string): { song: SongFile } | { error: string } {
  const title = state.title.trim();
  if (!title) return { error: "Add a title before saving." };
  const primary = toFile(generateArrangement(state.drum, state.lines));
  if (!primary) return { error: "Add at least one note before saving." };
  if (!isPlayable(primary)) return { error: "These notes are not on the selected drum." };
  const other = toFile(generateArrangement(state.drum === "C" ? "D" : "C", state.lines));
  if (!other) return { error: "The other drum arrangement could not be built." };
  const arrangements = {
    C: state.drum === "C" ? primary : other,
    D: state.drum === "D" ? primary : other,
  };
  return {
    song: {
      schemaVersion: 1,
      id,
      title,
      artist: "You",
      source: PERSONAL_SOURCE,
      license: "personal",
      attribution: PERSONAL_ATTRIBUTION,
      difficulty: "easy",
      tags: ["personal"],
      tempo: state.tempo,
      timeSignature: state.timeSignature,
      arrangements,
      verified: false,
    },
  };
}

export function personalIssues(song: SongFile): SongFailure[] {
  const failures: SongFailure[] = [];
  if (!song.id.startsWith("my-")) {
    failures.push({ file: "song", field: "/id", error: 'id must start with "my-"' });
  }
  if (song.license !== "personal") {
    failures.push({ file: "song", field: "/license", error: 'license must be "personal"' });
  }
  if (song.attribution !== PERSONAL_ATTRIBUTION) {
    failures.push({ file: "song", field: "/attribution", error: `attribution must be "${PERSONAL_ATTRIBUTION}"` });
  }
  return failures;
}

export async function issuesForPersonalSong(song: SongFile): Promise<SongFailure[]> {
  return [...(await validateSongDocument(song)), ...personalIssues(song)];
}

export function slugifyTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "song";
}

export function allocateId(preferred: string, taken: Set<string>): string {
  const cleaned = preferred
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  let base = cleaned.startsWith("my-") ? cleaned : `my-${cleaned || "song"}`;
  if (!/^my-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(base)) base = "my-song";
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

export type ImportIssue = { index: number; messages: string[] };

export async function importSongDocuments(data: unknown, taken: Set<string>): Promise<{ songs: SongFile[]; errors: ImportIssue[] }> {
  const items = Array.isArray(data) ? data : [data];
  const songs: SongFile[] = [];
  const errors: ImportIssue[] = [];
  const claimed = new Set(taken);
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const schemaErrors = await validateSongDocument(item);
    if (schemaErrors.length > 0) {
      errors.push({ index, messages: schemaErrors.map((failure) => `${failure.field}: ${failure.error}`) });
      continue;
    }
    const source = item as SongFile;
    const id = allocateId(source.id || slugifyTitle(source.title), claimed);
    const song: SongFile = {
      ...source,
      id,
      license: "personal",
      attribution: PERSONAL_ATTRIBUTION,
      tags: Array.from(new Set([...(source.tags ?? []), "personal"])),
    };
    const personal = personalIssues(song);
    if (personal.length > 0) {
      errors.push({ index, messages: personal.map((failure) => `${failure.field}: ${failure.error}`) });
      continue;
    }
    claimed.add(id);
    songs.push(song);
  }
  return { songs, errors };
}

export function exportSongs(songs: SongFile[]): SongFile | SongFile[] {
  return songs.length === 1 ? songs[0] : songs;
}

export function editorLines(arrangement: Arrangement): EditorState["lines"] {
  return arrangement.lines.map((line: SongLine) => ({
    lyric: line.lyric ?? "",
    notes: line.notes.map((note) => ({ ...note })),
  }));
}

export function minLayoutOf(arrangement: ArrangementFile): LayoutId | null {
  return isPlayable(arrangement) ? arrangement.minLayout : null;
}
