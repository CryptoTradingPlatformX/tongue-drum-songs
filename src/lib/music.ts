import layoutFile from "../../data/layouts.json";
import type { DrumKey, LayoutId, TimeSignature, Tongue } from "./types";

export type NoteEvent = {
  rest: boolean;
  deg?: number;
  oct?: number;
  dur: number;
};

export type PlayEvent = {
  lineIndex: number;
  noteIndex: number;
  rest: boolean;
  deg?: number;
  oct?: number;
  dur: number;
};

export type NotationMark = {
  glyph: string;
  dotsAbove: number;
  dotsBelow: number;
  dotted: boolean;
  dashes: number;
  underlines: number;
};

export type TieKind = "start" | "stop" | "continue" | null;

export type DisplaySlice = {
  lineIndex: number;
  noteIndex: number;
  dur: number;
  beat: number;
  tie: TieKind;
  note: NoteEvent;
  dividerBefore: boolean;
  pulseMarks: number[];
};

export type DisplayBar = {
  number: number;
  openedHere: boolean;
  closedHere: boolean;
  beats: number;
  slices: DisplaySlice[];
};

export type DisplayLine = {
  lyric?: string;
  bars: DisplayBar[];
};

type LayoutRecord = {
  id: LayoutId;
  noteCount: number;
  label: string;
  typical: boolean;
  blurb: string;
  tongues: Tongue[];
};

type LayoutFile = {
  keys: Record<DrumKey, { id: DrumKey; label: string; tonicMidi: number; mainOctave: string }>;
  layouts: LayoutRecord[];
};

const data = layoutFile as LayoutFile;

export const DRUM_KEYS = data.keys;
export const LAYOUTS: LayoutRecord[] = data.layouts;
export const LAYOUT_ORDER: LayoutId[] = ["8", "11", "13", "15"];

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const EPS = 1e-6;

export class NotationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotationError";
  }
}

export function layoutById(id: LayoutId): LayoutRecord {
  const found = LAYOUTS.find((layout) => layout.id === id);
  if (!found) throw new Error(`Unknown layout ${id}`);
  return found;
}

export function tongueKey(tongue: Pick<Tongue, "deg" | "oct">): string {
  return `${tongue.deg}:${tongue.oct}`;
}

export function pitchCompare(a: Tongue, b: Tongue): number {
  return a.oct - b.oct || a.deg - b.deg;
}

export function parseNote(raw: unknown): NoteEvent {
  if (!raw || typeof raw !== "object") {
    throw new NotationError("Note must be an object");
  }
  const note = raw as Record<string, unknown>;
  if (typeof note.dur !== "number" || !Number.isFinite(note.dur) || note.dur <= 0) {
    throw new NotationError("dur must be a positive number of quarter-note beats");
  }
  if (note.rest === true) {
    return { rest: true, dur: note.dur };
  }
  if (typeof note.deg !== "number" || !Number.isInteger(note.deg) || note.deg < 1 || note.deg > 7) {
    throw new NotationError("deg must be an integer from 1 to 7");
  }
  if (typeof note.oct !== "number" || !Number.isInteger(note.oct)) {
    throw new NotationError("oct must be an integer (dot above is +1, dot below is -1)");
  }
  return { rest: false, deg: note.deg, oct: note.oct, dur: note.dur };
}

export function parseLineNotes(rawNotes: unknown[]): NoteEvent[] {
  return rawNotes.map((note, index) => {
    try {
      return parseNote(note);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Invalid note";
      throw new NotationError(`note ${index + 1}: ${message}`);
    }
  });
}

export function noteMidi(key: DrumKey, deg: number, oct: number): number {
  return DRUM_KEYS[key].tonicMidi + MAJOR_STEPS[deg - 1] + oct * 12;
}

export function noteName(key: DrumKey, deg: number, oct: number): string {
  const midi = noteMidi(key, deg, oct);
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${SHARP_NAMES[pitchClass]}${octave}`;
}

export function octaveWord(oct: number): string {
  if (oct > 0) return "high ";
  if (oct < 0) return "low ";
  return "";
}

export function tonguePhrase(key: DrumKey, tongue: Tongue): string {
  return `${octaveWord(tongue.oct)}${tongue.deg} (${noteName(key, tongue.deg, tongue.oct)})`;
}

export function layoutPitchRange(layoutId: LayoutId, key: DrumKey): { low: string; high: string } {
  const tongues = [...layoutById(layoutId).tongues].sort(pitchCompare);
  const low = tongues[0];
  const high = tongues[tongues.length - 1];
  return {
    low: noteName(key, low.deg, low.oct),
    high: noteName(key, high.deg, high.oct),
  };
}

export function noteFitsLayout(deg: number, oct: number, layoutId: LayoutId): boolean {
  return layoutById(layoutId).tongues.some((tongue) => tongue.deg === deg && tongue.oct === oct);
}

export function missingTongues(notes: NoteEvent[], layoutId: LayoutId): Tongue[] {
  const have = new Set(layoutById(layoutId).tongues.map(tongueKey));
  const missing = new Map<string, Tongue>();
  for (const note of notes) {
    if (note.rest || note.deg == null || note.oct == null) continue;
    const key = tongueKey({ deg: note.deg, oct: note.oct });
    if (!have.has(key) && !missing.has(key)) {
      missing.set(key, { deg: note.deg, oct: note.oct });
    }
  }
  return [...missing.values()].sort(pitchCompare);
}

export function arrangementFits(notes: NoteEvent[], layoutId: LayoutId): boolean {
  return missingTongues(notes, layoutId).length === 0;
}

export function minimumLayout(notes: NoteEvent[]): LayoutId | null {
  for (const id of LAYOUT_ORDER) {
    if (arrangementFits(notes, id)) return id;
  }
  return null;
}

export function layoutRank(id: LayoutId): number {
  return LAYOUT_ORDER.indexOf(id);
}

export function songNeedsBiggerLayout(minLayout: LayoutId, selected: LayoutId): boolean {
  return layoutRank(selected) < layoutRank(minLayout);
}

export function layoutProblems(notes: NoteEvent[], minLayout: LayoutId): string[] {
  const problems: string[] = [];
  const missing = missingTongues(notes, minLayout);
  if (missing.length > 0) {
    const names = missing.map((tongue) => tonguePhrase("C", tongue)).join(", ");
    problems.push(`notes are not on the ${minLayout}-note layout: ${names}`);
  }
  const smallest = minimumLayout(notes);
  if (smallest == null) {
    problems.push("some notes are outside every drum layout");
  } else if (smallest !== minLayout) {
    problems.push(`minLayout is "${minLayout}" but the smallest matching layout is "${smallest}"`);
  }
  return problems;
}

export function beatsPerBar(timeSignature: string): number {
  switch (timeSignature) {
    case "4/4":
      return 4;
    case "3/4":
      return 3;
    case "2/4":
      return 2;
    case "2/2":
      // Two half-note pulses. A half note is 2 quarter-beats, so the bar is 4.
      return 4;
    case "6/8":
      // 6 eighths = 3 quarter-note beats, grouped as two dotted quarters.
      return 3;
    case "9/8":
      // 9 eighths = 4.5 quarter-note beats, grouped as three dotted quarters.
      return 4.5;
    case "12/8":
      // 12 eighths = 6 quarter-note beats, grouped as four dotted quarters.
      return 6;
    default:
      throw new NotationError(`Unsupported time signature: ${timeSignature}`);
  }
}

/**
 * Inner pulse length in quarter-note beats.
 * 6/8, 9/8, and 12/8 are dotted quarters (1.5). 2/2 is two half notes (2).
 * 4/4, 3/4, and 2/4 have no inner pulse.
 */
export function pulseBeats(timeSignature: string): number | null {
  if (timeSignature === "6/8" || timeSignature === "9/8" || timeSignature === "12/8") return 1.5;
  if (timeSignature === "2/2") return 2;
  if (timeSignature === "4/4" || timeSignature === "3/4" || timeSignature === "2/4") return null;
  throw new NotationError(`Unsupported time signature: ${timeSignature}`);
}

export function meterHelp(timeSignature: TimeSignature): string {
  switch (timeSignature) {
    case "4/4":
      return "4/4 · four quarter-note beats in a bar";
    case "3/4":
      return "3/4 · three quarter-note beats in a bar";
    case "2/4":
      return "2/4 · two quarter-note beats in a bar";
    case "2/2":
      return "2/2 · four quarter-beats, grouped as two half-note pulses";
    case "6/8":
      return "6/8 · three quarter-beats, grouped as two dotted-quarter pulses";
    case "9/8":
      return "9/8 · four and a half quarter-beats, grouped as three dotted-quarter pulses";
    case "12/8":
      return "12/8 · six quarter-beats, grouped as four dotted-quarter pulses";
  }
}

/** Seconds for a duration stored in quarter-note beats. Tempo is quarter-note BPM. */
export function quarterSeconds(durBeats: number, bpm: number): number {
  if (!(bpm > 0)) throw new NotationError("bpm must be a positive quarter-note tempo");
  return durBeats * (60 / bpm);
}

export function notationMark(note: Pick<NoteEvent, "rest" | "deg" | "oct" | "dur">): NotationMark {
  const oct = note.rest ? 0 : (note.oct ?? 0);
  const glyph = note.rest ? "0" : String(note.deg);
  const dotsAbove = Math.max(0, oct);
  const dotsBelow = Math.max(0, -oct);
  const dur = note.dur;
  if (dur < 1) {
    return {
      glyph,
      dotsAbove,
      dotsBelow,
      dotted: Math.abs(dur - 0.75) < EPS,
      dashes: 0,
      underlines: dur <= 0.25 + EPS ? 2 : 1,
    };
  }
  const whole = Math.floor(dur + EPS);
  const fraction = dur - whole;
  return {
    glyph,
    dotsAbove,
    dotsBelow,
    dotted: Math.abs(fraction - 0.5) < EPS,
    dashes: Math.max(0, whole - 1),
    underlines: 0,
  };
}

function onBoundary(beat: number, size: number): boolean {
  const modulo = beat % size;
  return modulo < EPS || Math.abs(modulo - size) < EPS;
}

type RawSlice = {
  lineIndex: number;
  noteIndex: number;
  dur: number;
  beat: number;
  tie: TieKind;
  note: NoteEvent;
  bar: number;
};

function splitAcrossBars(
  note: NoteEvent,
  lineIndex: number,
  noteIndex: number,
  beatStart: number,
  barBeats: number,
): RawSlice[] {
  const parts: { beat: number; dur: number }[] = [];
  let remaining = note.dur;
  let beat = beatStart;
  while (remaining > EPS) {
    const barIndex = Math.floor((beat + EPS) / barBeats);
    const barEnd = (barIndex + 1) * barBeats;
    let take = Math.min(remaining, barEnd - beat);
    if (remaining - take < EPS) take = remaining;
    if (take <= EPS) break;
    parts.push({ beat, dur: take });
    remaining -= take;
    beat += take;
  }
  return parts.map((part, index) => ({
    lineIndex,
    noteIndex,
    dur: part.dur,
    beat: part.beat,
    tie: parts.length === 1 ? null : index === 0 ? "start" : index === parts.length - 1 ? "stop" : "continue",
    note,
    bar: Math.floor((part.beat + EPS) / barBeats) + 1,
  }));
}

function marksInside(start: number, dur: number, barOrigin: number, barBeats: number, pulse: number | null): number[] {
  if (pulse == null) return [];
  const marks: number[] = [];
  const end = start + dur;
  for (let boundary = barOrigin + pulse; boundary < barOrigin + barBeats - EPS; boundary += pulse) {
    if (boundary > start + EPS && boundary < end - EPS) {
      marks.push((boundary - start) / dur);
    }
  }
  return marks;
}

export function layoutNotation(
  lines: { lyric?: string; notes: NoteEvent[] }[],
  timeSignature: TimeSignature | string,
): DisplayLine[] {
  const barBeats = beatsPerBar(timeSignature);
  const pulse = pulseBeats(timeSignature);
  let beat = 0;
  return lines.map((line, lineIndex) => {
    const raw: RawSlice[] = [];
    line.notes.forEach((note, noteIndex) => {
      raw.push(...splitAcrossBars(note, lineIndex, noteIndex, beat, barBeats));
      beat += note.dur;
    });
    const bars: DisplayBar[] = [];
    for (const slice of raw) {
      let bar = bars[bars.length - 1];
      if (!bar || bar.number !== slice.bar) {
        bar = {
          number: slice.bar,
          openedHere: false,
          closedHere: false,
          beats: 0,
          slices: [],
        };
        bars.push(bar);
      }
      const origin = (slice.bar - 1) * barBeats;
      const offset = slice.beat - origin;
      const dividerBefore = pulse != null && onBoundary(offset, pulse) && !onBoundary(offset, barBeats);
      bar.slices.push({
        lineIndex: slice.lineIndex,
        noteIndex: slice.noteIndex,
        dur: slice.dur,
        beat: slice.beat,
        tie: slice.tie,
        note: slice.note,
        dividerBefore,
        pulseMarks: marksInside(slice.beat, slice.dur, origin, barBeats, pulse),
      });
    }
    for (const bar of bars) {
      const first = bar.slices[0];
      const last = bar.slices[bar.slices.length - 1];
      bar.openedHere = onBoundary(first.beat, barBeats);
      bar.closedHere = onBoundary(last.beat + last.dur, barBeats);
      bar.beats = bar.slices.reduce((sum, slice) => sum + slice.dur, 0);
    }
    return { lyric: line.lyric, bars };
  });
}

export function flattenLines(lines: { notes: NoteEvent[] }[]): PlayEvent[] {
  const events: PlayEvent[] = [];
  lines.forEach((line, lineIndex) => {
    line.notes.forEach((note, noteIndex) => {
      events.push({
        lineIndex,
        noteIndex,
        rest: note.rest,
        deg: note.deg,
        oct: note.oct,
        dur: note.dur,
      });
    });
  });
  return events;
}

export function eventIndex(events: PlayEvent[], lineIndex: number, noteIndex: number): number {
  return events.findIndex((event) => event.lineIndex === lineIndex && event.noteIndex === noteIndex);
}
