import { degreePitch } from "../lib/pitch";
import type { DrumKey, LayoutId } from "../lib/types";

export type PianoTongue = {
  deg: number;
  oct: number;
  /** Scientific pitch name. C4 is middle C. Derived from the shared pitch module. */
  name: string;
  black: boolean;
  /** The 11-note C drum's low 5 is present but unconfirmed. */
  centerLikely?: boolean;
};

const C_ROWS: { deg: number; oct: number; centerLikely?: boolean }[] = [
  { deg: 5, oct: -1, centerLikely: true },
  { deg: 6, oct: -1 },
  { deg: 7, oct: -1 },
  { deg: 1, oct: 0 },
  { deg: 2, oct: 0 },
  { deg: 3, oct: 0 },
  { deg: 4, oct: 0 },
  { deg: 5, oct: 0 },
  { deg: 6, oct: 0 },
  { deg: 7, oct: 0 },
  { deg: 1, oct: 1 },
];

const D_ROWS: { deg: number; oct: number }[] = [
  { deg: 3, oct: -1 },
  { deg: 4, oct: -1 },
  { deg: 5, oct: -1 },
  { deg: 6, oct: -1 },
  { deg: 7, oct: -1 },
  { deg: 1, oct: 0 },
  { deg: 2, oct: 0 },
  { deg: 3, oct: 0 },
  { deg: 4, oct: 0 },
  { deg: 5, oct: 0 },
  { deg: 6, oct: 0 },
  { deg: 7, oct: 0 },
  { deg: 1, oct: 1 },
  { deg: 2, oct: 1 },
  { deg: 3, oct: 1 },
];

function withPitch(key: DrumKey, rows: { deg: number; oct: number; centerLikely?: boolean }[]): PianoTongue[] {
  return rows.map((row) => {
    const pitch = degreePitch(key, 4, row.deg, row.oct);
    const pc = ((pitch.midi % 12) + 12) % 12;
    const black = pc === 1 || pc === 3 || pc === 6 || pc === 8 || pc === 10;
    return { deg: row.deg, oct: row.oct, name: pitch.name, black, centerLikely: row.centerLikely };
  });
}

/** C 11-note drum. Home 1 is C4. Names come from the shared pitch module. */
export const C_DRUM_TONGUES: PianoTongue[] = withPitch("C", C_ROWS);

/** D 15-note Hopewell drum. Home 1 is D4. */
export const D_DRUM_TONGUES: PianoTongue[] = withPitch("D", D_ROWS);

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
