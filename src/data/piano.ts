import type { DrumKey, LayoutId } from "../lib/types";

export type PianoTongue = {
  deg: number;
  oct: number;
  /** Scientific pitch name. C4 is middle C. */
  name: string;
  black: boolean;
  /** The 11-note C drum's low 5 is present but unconfirmed. */
  centerLikely?: boolean;
};

/** C 11-note drum, C major, all white keys. */
export const C_DRUM_TONGUES: PianoTongue[] = [
  { deg: 5, oct: -1, name: "G3", black: false, centerLikely: true },
  { deg: 6, oct: -1, name: "A3", black: false },
  { deg: 7, oct: -1, name: "B3", black: false },
  { deg: 1, oct: 0, name: "C4", black: false },
  { deg: 2, oct: 0, name: "D4", black: false },
  { deg: 3, oct: 0, name: "E4", black: false },
  { deg: 4, oct: 0, name: "F4", black: false },
  { deg: 5, oct: 0, name: "G4", black: false },
  { deg: 6, oct: 0, name: "A4", black: false },
  { deg: 7, oct: 0, name: "B4", black: false },
  { deg: 1, oct: 1, name: "C5", black: false },
];

/** D 15-note Hopewell drum, D major. */
export const D_DRUM_TONGUES: PianoTongue[] = [
  { deg: 3, oct: -1, name: "F#3", black: true },
  { deg: 4, oct: -1, name: "G3", black: false },
  { deg: 5, oct: -1, name: "A3", black: false },
  { deg: 6, oct: -1, name: "B3", black: false },
  { deg: 7, oct: -1, name: "C#4", black: true },
  { deg: 1, oct: 0, name: "D4", black: false },
  { deg: 2, oct: 0, name: "E4", black: false },
  { deg: 3, oct: 0, name: "F#4", black: true },
  { deg: 4, oct: 0, name: "G4", black: false },
  { deg: 5, oct: 0, name: "A4", black: false },
  { deg: 6, oct: 0, name: "B4", black: false },
  { deg: 7, oct: 0, name: "C#5", black: true },
  { deg: 1, oct: 1, name: "D5", black: false },
  { deg: 2, oct: 1, name: "E5", black: false },
  { deg: 3, oct: 1, name: "F#5", black: true },
];

export const PIANO_TONGUES: Record<DrumKey, PianoTongue[]> = {
  C: C_DRUM_TONGUES,
  D: D_DRUM_TONGUES,
};

export const PIANO_LAYOUT: Record<DrumKey, LayoutId> = {
  C: "11",
  D: "15",
};

/** White keys from F3 through G5, so F#5 still has a key. */
export const PIANO_WHITE_KEYS = ["F3", "G3", "A3", "B3", "C4", "D4", "E4", "F4", "G4", "A4", "B4", "C5", "D5", "E5", "F5", "G5"];

export function blackKeyAfter(whiteName: string): string | null {
  const letter = whiteName[0];
  const octave = whiteName.slice(1);
  if (letter !== "F" && letter !== "G" && letter !== "A" && letter !== "C" && letter !== "D") return null;
  return `${letter}#${octave}`;
}
