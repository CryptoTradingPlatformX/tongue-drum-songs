import type { Tongue } from "./types";

export type Drum15Size = "short" | "long";

/** One outer tongue, clockwise from just right of the top of the drum. */
export type Drum15Outer = Tongue & {
  size: Drum15Size;
  /** Degrees clockwise from 12 o'clock. */
  angle: number;
};

const STEP = 360 / 14;
/** Half a step, so the first tongue sits just clockwise of 12 o'clock and its pair-mate sits just the other side. */
const START = STEP / 2;

/**
 * Steven's 15-note drum, read clockwise from the top of the photo.
 * Each scale degree is a neighboring pair. The longer tongue is the lower
 * octave of that pair. The center tongue is the remaining low 3.
 * A dot above the number is oct +1, a dot below is oct -1, and no dot is oct 0.
 */
const OUTER_SPEC: Array<Pick<Drum15Outer, "deg" | "oct" | "size">> = [
  { deg: 3, oct: 1, size: "short" },
  { deg: 3, oct: 0, size: "long" },
  { deg: 1, oct: 1, size: "short" },
  { deg: 1, oct: 0, size: "long" },
  { deg: 6, oct: 0, size: "short" },
  { deg: 6, oct: -1, size: "long" },
  { deg: 4, oct: 0, size: "short" },
  { deg: 4, oct: -1, size: "long" },
  { deg: 5, oct: 0, size: "short" },
  { deg: 5, oct: -1, size: "long" },
  { deg: 7, oct: 0, size: "short" },
  { deg: 7, oct: -1, size: "long" },
  { deg: 2, oct: 1, size: "short" },
  { deg: 2, oct: 0, size: "long" },
];

export const DRUM_15_OUTER: Drum15Outer[] = OUTER_SPEC.map((tongue, index) => ({
  ...tongue,
  angle: START + index * STEP,
}));

/** Large center tongue. Low 3: dot below the number. */
export const DRUM_15_CENTER: Tongue = { deg: 3, oct: -1 };

export function drum15Tongues(): Tongue[] {
  return [...DRUM_15_OUTER, DRUM_15_CENTER];
}
