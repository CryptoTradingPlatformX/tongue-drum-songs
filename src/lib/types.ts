export type Difficulty = "easy" | "medium" | "hard";
export type License =
  | "public-domain"
  | "CC0"
  | "CC-BY-4.0"
  | "CC-BY-SA-4.0"
  | "other-permissive"
  | "personal";
export type TimeSignature = "4/4" | "3/4" | "2/4" | "2/2" | "3/2" | "4/2" | "6/4" | "6/8" | "9/8" | "12/8";
export type LayoutId = "8" | "11" | "13" | "15";
export type DrumKey = "C" | "D";

export type SongNote = {
  deg?: number;
  oct?: number;
  dur: number;
  rest?: boolean;
};

export type SongLine = {
  lyric?: string;
  /** Optional section slug. Required on every line when the song has form. */
  section?: string;
  notes: SongNote[];
};

/** Same note shape as an arrangement line. `section` is omitted. */
export type VariantLine = {
  lyric?: string;
  notes: SongNote[];
};

/** verseLines[section][verseNumber][lineIndex] replaces that line for one verse. */
export type VerseLinePair = { C: VariantLine; D: VariantLine };

export type FormEntry = {
  section: string;
  verse?: number;
};

export type Arrangement = {
  minLayout: LayoutId;
  lines: SongLine[];
};

export type Song = {
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
  arrangements: { C: Arrangement; D: Arrangement };
  /** Play order. Absent means the arrangement lines play once, as written. */
  form?: FormEntry[];
  /** Extra lyrics keyed by section. verses[section][n - 1] is verse n. */
  verses?: Record<string, string[][]>;
  /**
   * Optional per-verse note variants.
   * verseLines[section][verse number][line index within the section] is { C, D }.
   * Keys are strings. A variant lyric, when present, matches verses[section][verse - 1][line].
   */
  verseLines?: Record<string, Record<string, Record<string, VerseLinePair>>>;
  arrangerNotes?: string;
  verified: boolean;
};

export type Tongue = { deg: number; oct: number };
