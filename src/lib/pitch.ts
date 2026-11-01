/** Major-scale pitches. C4 is middle C. One spelling per scale degree. */

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const NATURAL = [0, 2, 4, 5, 7, 9, 11];
const STEPS = [0, 2, 4, 5, 7, 9, 11];

export const MAJOR_KEYS = ["C", "G", "D", "A", "E", "B", "F#", "Gb", "Db", "Ab", "Eb", "Bb", "F"] as const;
export type MajorKey = (typeof MAJOR_KEYS)[number];

type Accidental = -1 | 0 | 1;

const ROOTS: Record<MajorKey, { letter: number; accidental: Accidental }> = {
  C: { letter: 0, accidental: 0 },
  G: { letter: 4, accidental: 0 },
  D: { letter: 1, accidental: 0 },
  A: { letter: 5, accidental: 0 },
  E: { letter: 2, accidental: 0 },
  B: { letter: 6, accidental: 0 },
  "F#": { letter: 3, accidental: 1 },
  Gb: { letter: 4, accidental: -1 },
  Db: { letter: 1, accidental: -1 },
  Ab: { letter: 5, accidental: -1 },
  Eb: { letter: 2, accidental: -1 },
  Bb: { letter: 6, accidental: -1 },
  F: { letter: 3, accidental: 0 },
};

export type SpelledPitch = {
  /** Scientific spelling, such as F#4, Bb3, Cb5, or E#5. */
  name: string;
  midi: number;
  octave: number;
};

export type ChordQuality = "major" | "minor" | "diminished" | "7";

const DEGREE_QUALITY = {
  I: { degree: 1, quality: "major" },
  ii: { degree: 2, quality: "minor" },
  iii: { degree: 3, quality: "minor" },
  IV: { degree: 4, quality: "major" },
  V: { degree: 5, quality: "major" },
  vi: { degree: 6, quality: "minor" },
  "vii°": { degree: 7, quality: "diminished" },
  V7: { degree: 5, quality: "7" },
} as const;

export type RomanNumeral = keyof typeof DEGREE_QUALITY;

type DegreeSpelling = { letter: number; accidental: Accidental; octave: number };

function accidentalFor(natural: number, target: number): Accidental {
  if (natural % 12 === target) return 0;
  if ((natural + 1) % 12 === target) return 1;
  if ((natural + 11) % 12 === target) return -1;
  throw new Error(`No single accidental spells pitch class ${target} on letter semitone ${natural}`);
}

function scaleRows(root: MajorKey, homeOctave: number): DegreeSpelling[] {
  const info = ROOTS[root];
  const rootPc = (NATURAL[info.letter] + info.accidental + 12) % 12;
  const rows: DegreeSpelling[] = [];
  let previous = info.letter;
  let wraps = 0;
  for (let index = 0; index < 7; index += 1) {
    const letter = (info.letter + index) % 7;
    if (index > 0 && letter <= previous) wraps += 1;
    previous = letter;
    const target = (rootPc + STEPS[index]) % 12;
    rows.push({
      letter,
      accidental: accidentalFor(NATURAL[letter], target),
      octave: homeOctave + wraps,
    });
  }
  return rows;
}

function spell(row: DegreeSpelling, oct: number): SpelledPitch {
  const octave = row.octave + oct;
  const accidental = row.accidental === 1 ? "#" : row.accidental === -1 ? "b" : "";
  return {
    name: `${LETTERS[row.letter]}${accidental}${octave}`,
    midi: (octave + 1) * 12 + NATURAL[row.letter] + row.accidental,
    octave,
  };
}

/** Pitch of scale degree `degree` (1–7), `oct` octaves above the home octave. */
export function degreePitch(root: MajorKey, homeOctave: number, degree: number, oct = 0): SpelledPitch {
  if (degree < 1 || degree > 7) throw new Error(`degree must be 1–7, got ${degree}`);
  return spell(scaleRows(root, homeOctave)[degree - 1], oct);
}

/** Letter names of the major scale, one per degree, without octave numbers. */
export function scaleSpelling(root: MajorKey): string[] {
  return scaleRows(root, 4).map((row) => {
    const accidental = row.accidental === 1 ? "#" : row.accidental === -1 ? "b" : "";
    return `${LETTERS[row.letter]}${accidental}`;
  });
}

export function scalePitchClasses(root: MajorKey): number[] {
  return scaleRows(root, 4).map((row) => (NATURAL[row.letter] + row.accidental + 12) % 12);
}

export function spelledChordName(root: MajorKey, roman: RomanNumeral): string {
  const { degree, quality } = DEGREE_QUALITY[roman];
  const letter = scaleSpelling(root)[degree - 1];
  if (quality === "7") return `${letter}7`;
  if (quality === "diminished") return `${letter} diminished`;
  if (quality === "minor") return `${letter} minor`;
  return `${letter} major`;
}

export function naturalMidi(letter: "C" | "D" | "E" | "F" | "G" | "A" | "B", octave: number): number {
  const index = LETTERS.indexOf(letter);
  return (octave + 1) * 12 + NATURAL[index];
}

export function isWhiteMidi(midi: number): boolean {
  const pc = ((midi % 12) + 12) % 12;
  return pc === 0 || pc === 2 || pc === 4 || pc === 5 || pc === 7 || pc === 9 || pc === 11;
}

/** Snap a MIDI span out to the surrounding white keys. */
export function whiteKeySpan(lowMidi: number, highMidi: number): { low: number; high: number } {
  let low = lowMidi;
  let high = highMidi;
  while (!isWhiteMidi(low)) low -= 1;
  while (!isWhiteMidi(high)) high += 1;
  return { low, high };
}

export function blackMidiAfter(whiteMidi: number): number | null {
  const next = whiteMidi + 1;
  return isWhiteMidi(next) ? null : next;
}
