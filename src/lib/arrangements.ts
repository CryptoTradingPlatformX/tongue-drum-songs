import { layoutById, minimumLayout, missingTongues, octaveWord, parseNote } from "./music";
import type { DrumKey, LayoutId, SongLine, SongNote, Tongue } from "./types";

/** Tongues the editor offers. C is the 11-note layout; D is the 15-note layout. */
export const DRUM_LAYOUT: Record<DrumKey, LayoutId> = { C: "11", D: "15" };

export const PERSONAL_ATTRIBUTION = "Created by you";
export const PERSONAL_SOURCE = { name: "On this device", url: "https://local.invalid/my-songs" };

export function otherDrum(drum: DrumKey): DrumKey {
  return drum === "C" ? "D" : "C";
}

export function tongueLabel(tongue: Tongue): string {
  return `${octaveWord(tongue.oct)}${tongue.deg}`.trim();
}

export type GeneratedArrangement =
  | { status: "empty" }
  | { status: "unavailable"; outOfRange: Tongue[] }
  | { status: "ready"; minLayout: LayoutId; lines: SongLine[] };

function copyLines(lines: SongLine[]): SongLine[] {
  return lines.map((line) => {
    const notes: SongNote[] = line.notes.map((note) =>
      note.rest === true
        ? { rest: true, dur: note.dur }
        : { deg: note.deg ?? 1, oct: note.oct ?? 0, dur: note.dur },
    );
    return line.lyric ? { lyric: line.lyric, notes } : { notes };
  });
}

/** Build the arrangement for one drum from numbered notes. Out-of-range notes are listed, not stored. */
export function generateArrangement(drum: DrumKey, lines: SongLine[]): GeneratedArrangement {
  const withNotes = lines.filter((line) => line.notes.length > 0);
  if (withNotes.length === 0) return { status: "empty" };
  const notes = withNotes.flatMap((line) => line.notes.map((note) => parseNote(note)));
  const missing = missingTongues(notes, DRUM_LAYOUT[drum]);
  if (missing.length > 0) return { status: "unavailable", outOfRange: missing };
  const minLayout = minimumLayout(notes);
  if (minLayout == null) return { status: "unavailable", outOfRange: [] };
  return { status: "ready", minLayout, lines: copyLines(withNotes) };
}

export function drumsForEditor(): Record<DrumKey, { layout: LayoutId; tongues: Tongue[] }> {
  return {
    C: { layout: DRUM_LAYOUT.C, tongues: layoutById(DRUM_LAYOUT.C).tongues },
    D: { layout: DRUM_LAYOUT.D, tongues: layoutById(DRUM_LAYOUT.D).tongues },
  };
}
