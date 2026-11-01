import type { DrumKey, LayoutId } from "../lib/types";

export type ScaleDegree = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** -1 is a dot below the number, 0 is the main octave, +1 is a dot above. */
export type ChordOctave = -1 | 0 | 1;

export type ChordTone = {
  deg: ScaleDegree;
  oct: ChordOctave;
};

export type ChordVoicing = {
  id: string;
  tones: ChordTone[];
};

export type ChordRoman = "I" | "ii" | "iii" | "IV" | "V" | "vi" | "vii°" | "V7";

export type Chord = {
  roman: ChordRoman;
  /** Scale degrees that belong to the chord, ignoring octave. */
  degrees: ScaleDegree[];
  name: Record<DrumKey, string>;
  voicings: Record<DrumKey, ChordVoicing[]>;
};

/** Steven's C drum is the 11-note layout. His D drum is the 15-note layout. */
export const CHORD_LAYOUT: Record<DrumKey, LayoutId> = {
  C: "11",
  D: "15",
};

const tone = (deg: ScaleDegree, oct: ChordOctave = 0): ChordTone => ({ deg, oct });

function voicing(id: string, tones: ChordTone[]): ChordVoicing {
  return { id, tones };
}

export const CHORDS: Chord[] = [
  {
    roman: "I",
    degrees: [1, 3, 5],
    name: { C: "C major", D: "D major" },
    voicings: {
      C: [voicing("I-c-1", [tone(1), tone(3), tone(5)]), voicing("I-c-2", [tone(1), tone(3), tone(5), tone(1, 1)])],
      D: [
        voicing("I-d-1", [tone(1), tone(3), tone(5)]),
        voicing("I-d-2", [tone(5, -1), tone(1), tone(3)]),
        voicing("I-d-3", [tone(1), tone(3), tone(5), tone(1, 1), tone(3, 1)]),
      ],
    },
  },
  {
    roman: "ii",
    degrees: [2, 4, 6],
    name: { C: "D minor", D: "E minor" },
    voicings: {
      C: [voicing("ii-c-1", [tone(2), tone(4), tone(6)])],
      D: [voicing("ii-d-1", [tone(2), tone(4), tone(6)]), voicing("ii-d-2", [tone(6, -1), tone(2), tone(4)])],
    },
  },
  {
    roman: "iii",
    degrees: [3, 5, 7],
    name: { C: "E minor", D: "F# minor" },
    voicings: {
      C: [voicing("iii-c-1", [tone(3), tone(5), tone(7)])],
      D: [voicing("iii-d-1", [tone(3), tone(5), tone(7)]), voicing("iii-d-2", [tone(3, -1), tone(5, -1), tone(7, -1)])],
    },
  },
  {
    roman: "IV",
    degrees: [4, 6, 1],
    name: { C: "F major", D: "G major" },
    voicings: {
      C: [voicing("IV-c-1", [tone(4), tone(6), tone(1, 1)])],
      D: [voicing("IV-d-1", [tone(4), tone(6), tone(1, 1)]), voicing("IV-d-2", [tone(4, -1), tone(6, -1), tone(1)])],
    },
  },
  {
    roman: "V",
    degrees: [5, 7, 2],
    name: { C: "G major", D: "A major" },
    voicings: {
      C: [voicing("V-c-1", [tone(2), tone(5), tone(7)])],
      D: [voicing("V-d-1", [tone(5), tone(7), tone(2, 1)]), voicing("V-d-2", [tone(5, -1), tone(7, -1), tone(2)])],
    },
  },
  {
    roman: "vi",
    degrees: [6, 1, 3],
    name: { C: "A minor", D: "B minor" },
    voicings: {
      C: [voicing("vi-c-1", [tone(6, -1), tone(1), tone(3)]), voicing("vi-c-2", [tone(3), tone(6), tone(1, 1)])],
      D: [voicing("vi-d-1", [tone(6, -1), tone(1), tone(3)]), voicing("vi-d-2", [tone(6), tone(1, 1), tone(3, 1)])],
    },
  },
  {
    roman: "vii°",
    degrees: [7, 2, 4],
    name: { C: "B diminished", D: "C# diminished" },
    voicings: {
      C: [voicing("vii-c-1", [tone(7, -1), tone(2), tone(4)])],
      D: [voicing("vii-d-1", [tone(7, -1), tone(2), tone(4)]), voicing("vii-d-2", [tone(4), tone(7), tone(2, 1)])],
    },
  },
  {
    roman: "V7",
    degrees: [5, 7, 2, 4],
    name: { C: "G7", D: "A7" },
    voicings: { C: [], D: [] },
  },
];

export function chordLabel(chord: Chord): string {
  return `${chord.roman} = ${chord.name.C} in C, ${chord.name.D} in D`;
}
