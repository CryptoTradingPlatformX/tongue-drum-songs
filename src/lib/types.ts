export type Difficulty = "easy" | "medium" | "hard";
export type License =
  | "public-domain"
  | "CC0"
  | "CC-BY-4.0"
  | "CC-BY-SA-4.0"
  | "other-permissive";
export type TimeSignature = "4/4" | "3/4" | "2/4" | "2/2" | "6/8";
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
  notes: SongNote[];
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
  arrangerNotes?: string;
  verified: boolean;
};

export type Tongue = { deg: number; oct: number };
