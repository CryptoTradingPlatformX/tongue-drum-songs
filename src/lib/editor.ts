import { DRUM_LAYOUT, generateArrangement, otherDrum, tongueLabel } from "./arrangements";
import { beatsPerBar, noteFitsLayout } from "./music";
import type { DrumKey, SongNote, TimeSignature } from "./types";

export type EditorNote = SongNote & { uncertain?: boolean };
export type EditorLine = { lyric: string; notes: EditorNote[] };

export type NoteSelection = { line: number; note: number };

export type Caret = { line: number; index: number };

type Snap = {
  title: string;
  tempo: number;
  timeSignature: TimeSignature;
  drum: DrumKey;
  lines: EditorLine[];
  selection: NoteSelection | null;
  rangeEnd: NoteSelection | null;
  caret: Caret;
  barsPerLine: number;
  dotted: boolean;
};

export type EditorState = Snap & {
  id: string;
  duration: number;
  past: Snap[];
  future: Snap[];
};

export type EditorAction =
  | { type: "setTitle"; title: string }
  | { type: "setTempo"; tempo: number }
  | { type: "setTimeSignature"; timeSignature: TimeSignature }
  | { type: "setDrum"; drum: DrumKey }
  | { type: "setDuration"; duration: number }
  | { type: "select"; line: number; note: number }
  | { type: "appendTongue"; deg: number; oct: number }
  | { type: "appendDetected"; deg: number; oct: number; dur: number; uncertain: boolean; previousDur?: number }
  | { type: "appendRest" }
  | { type: "insertNote" }
  | { type: "insertRest" }
  | { type: "deleteNote" }
  | { type: "setTongue"; deg: number; oct: number }
  | { type: "toggleRest" }
  | { type: "splitLine" }
  | { type: "mergeLine" }
  | { type: "setLyric"; line: number; lyric: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "strike"; deg: number; oct: number }
  | { type: "moveCaret"; line: number; index: number }
  | { type: "moveBy"; delta: number }
  | { type: "deleteBackward" }
  | { type: "deleteForward" }
  | { type: "repeatLast" }
  | { type: "setDotted"; dotted: boolean }
  | { type: "setBarsPerLine"; bars: number }
  | { type: "selectRange"; line: number; note: number }
  | { type: "selectAll" }
  | { type: "clearAll" }
  | { type: "deleteRange" }
  | { type: "duplicateRange" }
  | { type: "paste"; notes: EditorNote[] }
  | { type: "shiftRange"; steps: number }
  | { type: "replaceLines"; lines: EditorLine[] };

const HISTORY = 80;

export function createEditor(partial?: Partial<EditorState>): EditorState {
  return {
    id: partial?.id ?? "my-song",
    title: partial?.title ?? "Untitled",
    tempo: partial?.tempo ?? 100,
    timeSignature: partial?.timeSignature ?? "4/4",
    drum: partial?.drum ?? "C",
    lines: partial?.lines ? cloneLines(partial.lines) : [{ lyric: "", notes: [] }],
    duration: partial?.duration ?? 1,
    selection: partial?.selection ?? null,
    rangeEnd: partial?.rangeEnd ?? null,
    caret: partial?.caret ?? { line: 0, index: partial?.lines?.[0]?.notes.length ?? 0 },
    barsPerLine: partial?.barsPerLine ?? 0,
    dotted: partial?.dotted ?? false,
    past: [],
    future: [],
  };
}

export function defaultBarsPerLine(meter: TimeSignature): number {
  return beatsPerBar(meter) <= 4 ? 4 : 2;
}

export function barsInUse(state: EditorState): number {
  return state.barsPerLine > 0 ? state.barsPerLine : defaultBarsPerLine(state.timeSignature);
}

export function effectiveDuration(state: EditorState): number {
  return state.dotted ? state.duration * 1.5 : state.duration;
}

export type BarFill = "complete" | "short" | "over";

export function barFills(notes: { dur: number }[], meter: TimeSignature): BarFill[] {
  const per = beatsPerBar(meter);
  const marks: BarFill[] = [];
  let acc = 0;
  let over = false;
  for (const note of notes) {
    if (acc > 1e-6 && acc + note.dur > per + 1e-6) {
      marks.push(over || acc > per + 1e-6 ? "over" : "short");
      acc = 0;
      over = false;
    }
    acc += note.dur;
    if (acc > per + 1e-6) over = true;
    if (acc >= per - 1e-6) {
      marks.push(over ? "over" : "complete");
      acc = 0;
      over = false;
    }
  }
  if (acc > 1e-6) marks.push(over ? "over" : "short");
  return marks;
}

function cloneLines(lines: EditorLine[]): EditorLine[] {
  return lines.map((line) => ({
    lyric: line.lyric,
    notes: line.notes.map((note) => ({ ...note })),
  }));
}

function snap(state: EditorState): Snap {
  return {
    title: state.title,
    tempo: state.tempo,
    timeSignature: state.timeSignature,
    drum: state.drum,
    lines: cloneLines(state.lines),
    selection: state.selection ? { ...state.selection } : null,
    rangeEnd: state.rangeEnd ? { ...state.rangeEnd } : null,
    caret: { ...state.caret },
    barsPerLine: state.barsPerLine,
    dotted: state.dotted,
  };
}

function commit(state: EditorState, patch: Partial<Snap>): EditorState {
  return {
    ...state,
    ...patch,
    lines: patch.lines ? cloneLines(patch.lines) : state.lines,
    past: [...state.past, snap(state)].slice(-HISTORY),
    future: [],
  };
}

function pitched(dur: number, deg = 1, oct = 0): SongNote {
  return { deg, oct, dur };
}

function rest(dur: number): SongNote {
  return { rest: true, dur };
}

function fits(state: EditorState, deg: number, oct: number): boolean {
  return noteFitsLayout(deg, oct, DRUM_LAYOUT[state.drum]);
}

function ensureLine(lines: EditorLine[]): EditorLine[] {
  if (lines.length === 0) return [{ lyric: "", notes: [] }];
  return lines;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "setTitle":
      if (action.title === state.title) return state;
      return commit(state, { title: action.title });
    case "setTempo": {
      if (!Number.isFinite(action.tempo) || action.tempo <= 0 || action.tempo > 400) return state;
      if (action.tempo === state.tempo) return state;
      return commit(state, { tempo: action.tempo });
    }
    case "setTimeSignature":
      if (action.timeSignature === state.timeSignature) return state;
      return commit(state, { timeSignature: action.timeSignature });
    case "setDrum": {
      if (action.drum === state.drum) return state;
      const generated = generateArrangement(action.drum, state.lines);
      if (generated.status === "unavailable") return state;
      return commit(state, { drum: action.drum });
    }
    case "setDuration": {
      if (!Number.isFinite(action.duration) || action.duration <= 0) return state;
      const selection = state.selection;
      const applied = action.duration * (state.dotted ? 1.5 : 1);
      if (!selection) return { ...state, duration: action.duration };
      const lines = cloneLines(state.lines);
      const note = lines[selection.line]?.notes[selection.note];
      if (!note) return { ...state, duration: action.duration };
      if (note.dur === applied && state.duration === action.duration) return state;
      lines[selection.line].notes[selection.note] = { ...note, dur: applied };
      return { ...commit(state, { lines }), duration: action.duration };
    }
    case "select": {
      const line = state.lines[action.line];
      if (!line || action.note < 0 || action.note >= line.notes.length) return state;
      return { ...state, selection: { line: action.line, note: action.note }, rangeEnd: null, caret: { line: action.line, index: action.note } };
    }
    case "appendTongue": {
      if (!fits(state, action.deg, action.oct)) return state;
      const lines = ensureLine(cloneLines(state.lines));
      const line = lines.length - 1;
      lines[line].notes.push(pitched(state.duration, action.deg, action.oct));
      return commit(state, { lines, selection: { line, note: lines[line].notes.length - 1 } });
    }
    case "appendDetected":
      return appendDetected(state, action);
    case "appendRest": {
      const lines = ensureLine(cloneLines(state.lines));
      const line = lines.length - 1;
      lines[line].notes.push(rest(state.duration));
      return commit(state, { lines, selection: { line, note: lines[line].notes.length - 1 } });
    }
    case "insertNote":
      return insert(state, pitched(state.duration));
    case "insertRest":
      return insert(state, rest(state.duration));
    case "deleteNote":
      return removeSelected(state);
    case "setTongue": {
      const selection = state.selection;
      if (!selection || !fits(state, action.deg, action.oct)) return state;
      const lines = cloneLines(state.lines);
      const note = lines[selection.line]?.notes[selection.note];
      if (!note) return state;
      lines[selection.line].notes[selection.note] = pitched(note.dur, action.deg, action.oct);
      return commit(state, { lines });
    }
    case "toggleRest": {
      const selection = state.selection;
      if (!selection) return state;
      const lines = cloneLines(state.lines);
      const note = lines[selection.line]?.notes[selection.note];
      if (!note) return state;
      lines[selection.line].notes[selection.note] =
        note.rest === true ? pitched(note.dur) : rest(note.dur);
      return commit(state, { lines });
    }
    case "splitLine":
      return split(state);
    case "mergeLine":
      return merge(state);
    case "setLyric": {
      const lines = cloneLines(state.lines);
      if (!lines[action.line] || lines[action.line].lyric === action.lyric) return state;
      lines[action.line] = { ...lines[action.line], lyric: action.lyric };
      return commit(state, { lines });
    }
    case "undo": {
      const previous = state.past[state.past.length - 1];
      if (!previous) return state;
      return {
        ...state,
        ...previous,
        lines: cloneLines(previous.lines),
        past: state.past.slice(0, -1),
        future: [snap(state), ...state.future].slice(0, HISTORY),
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next) return state;
      return {
        ...state,
        ...next,
        lines: cloneLines(next.lines),
        past: [...state.past, snap(state)].slice(-HISTORY),
        future: state.future.slice(1),
      };
    }
    case "strike":
      return strike(state, action.deg, action.oct);
    case "moveCaret":
      return placeCaret(state, action.line, action.index);
    case "moveBy":
      return moveBy(state, action.delta);
    case "deleteBackward":
      return deleteBackward(state);
    case "deleteForward":
      return deleteForward(state);
    case "repeatLast":
      return repeatLast(state);
    case "setDotted":
      return state.dotted === action.dotted ? state : { ...state, dotted: action.dotted };
    case "setBarsPerLine":
      return { ...state, barsPerLine: action.bars };
    case "selectRange":
      return selectRange(state, action.line, action.note);
    case "selectAll":
      return selectAll(state);
    case "clearAll":
      return commit(state, { lines: [{ lyric: "", notes: [] }], selection: null, rangeEnd: null, caret: { line: 0, index: 0 } });
    case "deleteRange":
      return deleteRange(state);
    case "duplicateRange":
      return duplicateRange(state);
    case "paste":
      return paste(state, action.notes);
    case "shiftRange":
      return shiftRange(state, action.steps);
    case "replaceLines": {
      const lines = ensureLine(action.lines.map((line) => ({ lyric: line.lyric, notes: line.notes.map((note) => ({ ...note })) })));
      const last = lines.length - 1;
      return commit(state, {
        lines,
        selection: null,
        rangeEnd: null,
        caret: { line: last, index: lines[last].notes.length },
      });
    }
    default:
      return state;
  }
}

function placeCaret(state: EditorState, line: number, index: number): EditorState {
  const target = state.lines[line];
  if (!target) return state;
  const clamped = Math.max(0, Math.min(index, target.notes.length));
  return { ...state, caret: { line, index: clamped }, selection: null, rangeEnd: null };
}

function moveBy(state: EditorState, delta: number): EditorState {
  const caret = state.selection ? { line: state.selection.line, index: state.selection.note + (delta > 0 ? 1 : 0) } : state.caret;
  let line = caret.line;
  let index = caret.index + delta;
  while (line > 0 && index < 0) {
    line -= 1;
    index = state.lines[line].notes.length + index + 1;
  }
  while (line < state.lines.length - 1 && index > state.lines[line].notes.length) {
    index -= state.lines[line].notes.length + 1;
    line += 1;
  }
  return placeCaret(state, line, index);
}

function appendDetected(
  state: EditorState,
  action: { deg: number; oct: number; dur: number; uncertain: boolean; previousDur?: number },
): EditorState {
  if (!fits(state, action.deg, action.oct)) return state;
  const lines = ensureLine(cloneLines(state.lines));
  let line = Math.min(state.caret.line, lines.length - 1);
  let index = Math.max(0, Math.min(state.caret.index, lines[line].notes.length));
  if (state.selection && !state.rangeEnd) {
    line = Math.min(state.selection.line, lines.length - 1);
    index = Math.min(state.selection.note + 1, lines[line].notes.length);
  }
  if (action.previousDur != null) {
    if (index > 0) {
      const previous = lines[line].notes[index - 1];
      lines[line].notes[index - 1] = { ...previous, dur: action.previousDur };
    } else if (line > 0 && lines[line - 1].notes.length > 0) {
      const previous = lines[line - 1].notes[lines[line - 1].notes.length - 1];
      lines[line - 1].notes[lines[line - 1].notes.length - 1] = { ...previous, dur: action.previousDur };
    }
  }
  lines[line].notes.splice(index, 0, {
    deg: action.deg,
    oct: action.oct,
    dur: action.dur,
    ...(action.uncertain ? { uncertain: true as const } : {}),
  });
  const broken = overflow(lines, line, { ...state, caret: { line, index } });
  const placed = noteBefore(broken.lines, broken.caret);
  return commit(state, {
    lines: broken.lines,
    selection: action.uncertain && placed ? placed : null,
    rangeEnd: null,
    caret: broken.caret,
  });
}

function noteBefore(lines: EditorLine[], caret: Caret): NoteSelection | null {
  if (caret.index > 0 && lines[caret.line]?.notes[caret.index - 1]) return { line: caret.line, note: caret.index - 1 };
  if (caret.line > 0 && lines[caret.line - 1]?.notes.length) {
    return { line: caret.line - 1, note: lines[caret.line - 1].notes.length - 1 };
  }
  return lines[0]?.notes[0] ? { line: 0, note: 0 } : null;
}

function strike(state: EditorState, deg: number, oct: number): EditorState {
  if (!fits(state, deg, oct)) return state;
  const dur = effectiveDuration(state);
  if (state.selection && !state.rangeEnd) {
    const lines = cloneLines(state.lines);
    const note = lines[state.selection.line]?.notes[state.selection.note];
    if (!note) return state;
    lines[state.selection.line].notes[state.selection.note] = { ...pitched(note.dur, deg, oct) };
    const next = state.selection.note + 1;
    const hasNext = next < lines[state.selection.line].notes.length;
    return commit(state, {
      lines,
      selection: hasNext ? { line: state.selection.line, note: next } : null,
      caret: { line: state.selection.line, index: hasNext ? next : next },
    });
  }
  const lines = ensureLine(cloneLines(state.lines));
  const line = Math.min(state.caret.line, lines.length - 1);
  const index = Math.max(0, Math.min(state.caret.index, lines[line].notes.length));
  lines[line].notes.splice(index, 0, pitched(dur, deg, oct));
  const broken = overflow(lines, line, state);
  return commit(state, { lines: broken.lines, selection: null, rangeEnd: null, caret: broken.caret });
}

function overflow(lines: EditorLine[], lineIndex: number, state: EditorState): { lines: EditorLine[]; caret: Caret } {
  const limit = beatsPerBar(state.timeSignature) * barsInUse(state);
  const line = lines[lineIndex];
  if (!line) return { lines, caret: state.caret };
  let beats = 0;
  let cut = line.notes.length;
  for (let index = 0; index < line.notes.length; index += 1) {
    if (beats >= limit - 1e-6) {
      cut = index;
      break;
    }
    beats += line.notes[index].dur;
  }
  if (cut >= line.notes.length) {
    return { lines, caret: { line: lineIndex, index: Math.min(state.caret.index + 1, line.notes.length) } };
  }
  const stay = line.notes.slice(0, cut);
  const extra = line.notes.slice(cut);
  lines.splice(lineIndex, 1, { ...line, notes: stay }, { lyric: "", notes: extra });
  const caretIndex = state.caret.index >= cut ? state.caret.index - cut + 1 : state.caret.index + 1;
  const caretLine = state.caret.index >= cut ? lineIndex + 1 : lineIndex;
  return { lines, caret: { line: caretLine, index: Math.max(0, caretIndex) } };
}

function deleteBackward(state: EditorState): EditorState {
  if (state.rangeEnd && state.selection) return deleteRange(state);
  if (state.selection) return removeSelected(state);
  if (state.caret.index === 0 && state.caret.line === 0) return state;
  const lines = cloneLines(state.lines);
  let line = state.caret.line;
  let index = state.caret.index - 1;
  if (index < 0) {
    if (line === 0) return state;
    const prev = lines[line - 1];
    const current = lines[line];
    const at = prev.notes.length;
    lines.splice(line - 1, 2, { lyric: joinLyrics(prev.lyric, current.lyric), notes: [...prev.notes, ...current.notes] });
    line -= 1;
    index = at - 1;
    if (index < 0) return commit(state, { lines, caret: { line, index: 0 }, selection: null, rangeEnd: null });
  }
  lines[line].notes.splice(index, 1);
  return commit(state, { lines: ensureLine(lines), caret: { line, index }, selection: null, rangeEnd: null });
}

function deleteForward(state: EditorState): EditorState {
  if (state.rangeEnd && state.selection) return deleteRange(state);
  const lines = cloneLines(state.lines);
  const line = lines[state.caret.line];
  if (!line || state.caret.index >= line.notes.length) return state;
  line.notes.splice(state.caret.index, 1);
  return commit(state, { lines: ensureLine(lines), selection: null, rangeEnd: null });
}

function repeatLast(state: EditorState): EditorState {
  const line = state.lines[state.caret.line];
  const previous = line?.notes[state.caret.index - 1] ?? line?.notes[line.notes.length - 1];
  if (!previous) return state;
  if (previous.rest) {
    const lines = ensureLine(cloneLines(state.lines));
    const at = Math.min(state.caret.index, lines[state.caret.line].notes.length);
    lines[state.caret.line].notes.splice(at, 0, rest(previous.dur));
    return commit(state, { lines, caret: { line: state.caret.line, index: at + 1 }, selection: null, rangeEnd: null });
  }
  return strike({ ...state, duration: previous.dur, dotted: false, selection: null, rangeEnd: null }, previous.deg ?? 1, previous.oct ?? 0);
}

function selectRange(state: EditorState, line: number, note: number): EditorState {
  const target = state.lines[line];
  if (!target || note < 0 || note >= target.notes.length) return state;
  if (!state.selection) return { ...state, selection: { line, note }, rangeEnd: null };
  return { ...state, rangeEnd: { line, note } };
}

function selectAll(state: EditorState): EditorState {
  const lastLine = state.lines.length - 1;
  const lastNote = state.lines[lastLine]?.notes.length ?? 0;
  if (lastNote === 0 && state.lines.every((line) => line.notes.length === 0)) return state;
  let start: NoteSelection | null = null;
  let end: NoteSelection | null = null;
  state.lines.forEach((line, lineIndex) => {
    if (line.notes.length === 0) return;
    if (!start) start = { line: lineIndex, note: 0 };
    end = { line: lineIndex, note: line.notes.length - 1 };
  });
  if (!start || !end) return state;
  return { ...state, selection: start, rangeEnd: end };
}

function rangeBounds(state: EditorState): { start: NoteSelection; end: NoteSelection } | null {
  if (!state.selection) return null;
  const end = state.rangeEnd ?? state.selection;
  const flip = end.line < state.selection.line || (end.line === state.selection.line && end.note < state.selection.note);
  return { start: flip ? end : state.selection, end: flip ? state.selection : end };
}

export function selectedNotes(state: EditorState): EditorNote[] {
  const bounds = rangeBounds(state);
  if (!bounds) return [];
  const notes: EditorNote[] = [];
  for (let line = bounds.start.line; line <= bounds.end.line; line += 1) {
    const row = state.lines[line];
    if (!row) continue;
    const from = line === bounds.start.line ? bounds.start.note : 0;
    const to = line === bounds.end.line ? bounds.end.note : row.notes.length - 1;
    notes.push(...row.notes.slice(from, to + 1).map((note) => ({ ...note })));
  }
  return notes;
}

function deleteRange(state: EditorState): EditorState {
  const bounds = rangeBounds(state);
  if (!bounds) return state;
  const lines = cloneLines(state.lines);
  for (let line = bounds.end.line; line >= bounds.start.line; line -= 1) {
    const row = lines[line];
    if (!row) continue;
    const from = line === bounds.start.line ? bounds.start.note : 0;
    const to = line === bounds.end.line ? bounds.end.note : row.notes.length - 1;
    row.notes.splice(from, to - from + 1);
  }
  const compact = lines.filter((line, index) => line.notes.length > 0 || lines.length === 1 || index === 0);
  const kept = compact.length > 0 ? compact : [{ lyric: "", notes: [] }];
  return commit(state, {
    lines: kept,
    selection: null,
    rangeEnd: null,
    caret: { line: Math.min(bounds.start.line, kept.length - 1), index: bounds.start.note },
  });
}

function duplicateRange(state: EditorState): EditorState {
  return paste(state, selectedNotes(state));
}

function paste(state: EditorState, notes: EditorNote[]): EditorState {
  if (notes.length === 0) return state;
  const lines = ensureLine(cloneLines(state.lines));
  const line = Math.min(state.caret.line, lines.length - 1);
  const index = Math.max(0, Math.min(state.caret.index, lines[line].notes.length));
  const usable = notes.filter((note) => note.rest || fits(state, note.deg ?? 1, note.oct ?? 0));
  if (usable.length === 0) return state;
  lines[line].notes.splice(index, 0, ...usable.map((note) => ({ ...note })));
  return commit(state, {
    lines,
    selection: null,
    rangeEnd: null,
    caret: { line, index: index + usable.length },
  });
}

function shiftRange(state: EditorState, steps: number): EditorState {
  const bounds = rangeBounds(state);
  if (!bounds || steps === 0) return state;
  const lines = cloneLines(state.lines);
  for (let line = bounds.start.line; line <= bounds.end.line; line += 1) {
    const row = lines[line];
    if (!row) continue;
    const from = line === bounds.start.line ? bounds.start.note : 0;
    const to = line === bounds.end.line ? bounds.end.note : row.notes.length - 1;
    for (let index = from; index <= to; index += 1) {
      const note = row.notes[index];
      if (note.rest || note.deg == null) continue;
      const shifted = shiftNote(note.deg, note.oct ?? 0, steps);
      if (!fits(state, shifted.deg, shifted.oct)) return state;
      row.notes[index] = { ...note, deg: shifted.deg, oct: shifted.oct, uncertain: undefined };
    }
  }
  return commit(state, { lines });
}

function shiftNote(deg: number, oct: number, steps: number): { deg: number; oct: number } {
  let degree = deg;
  let octave = oct;
  const dir = steps > 0 ? 1 : -1;
  for (let left = Math.abs(steps); left > 0; left -= 1) {
    degree += dir;
    if (degree > 7) {
      degree = 1;
      octave += 1;
    }
    if (degree < 1) {
      degree = 7;
      octave -= 1;
    }
  }
  return { deg: degree, oct: Math.max(-1, Math.min(1, octave)) };
}

function insert(state: EditorState, note: SongNote): EditorState {
  const lines = ensureLine(cloneLines(state.lines));
  const selection = state.selection;
  const line = selection ? selection.line : lines.length - 1;
  const index = selection ? selection.note : lines[line].notes.length;
  if (!lines[line]) return state;
  lines[line].notes.splice(index, 0, note);
  return commit(state, { lines, selection: { line, note: index } });
}

function removeSelected(state: EditorState): EditorState {
  const selection = state.selection;
  if (!selection) return state;
  const lines = cloneLines(state.lines);
  const line = lines[selection.line];
  if (!line || selection.note < 0 || selection.note >= line.notes.length) return state;
  line.notes.splice(selection.note, 1);
  let nextLine = selection.line;
  let nextNote = selection.note;
  if (line.notes.length === 0 && lines.length > 1) {
    lines.splice(selection.line, 1);
    nextLine = Math.min(selection.line, lines.length - 1);
    nextNote = Math.max(0, lines[nextLine].notes.length - 1);
  } else if (line.notes.length === 0) {
    return commit(state, { lines, selection: null });
  } else if (nextNote >= line.notes.length) {
    nextNote = line.notes.length - 1;
  }
  const selectionNext = lines[nextLine].notes.length > 0 ? { line: nextLine, note: nextNote } : null;
  return commit(state, { lines: ensureLine(lines), selection: selectionNext });
}

function split(state: EditorState): EditorState {
  const selection = state.selection;
  if (!selection || selection.note <= 0) return state;
  const lines = cloneLines(state.lines);
  const line = lines[selection.line];
  if (!line || selection.note >= line.notes.length) return state;
  const before = line.notes.slice(0, selection.note);
  const after = line.notes.slice(selection.note);
  lines.splice(selection.line, 1, { ...line, notes: before }, { lyric: "", notes: after });
  return commit(state, { lines, selection: { line: selection.line + 1, note: 0 } });
}

function merge(state: EditorState): EditorState {
  const selection = state.selection;
  const index = selection?.line ?? state.lines.length - 1;
  const lines = cloneLines(state.lines);
  if (index < 0 || index >= lines.length) return state;
  if (index >= lines.length - 1) {
    if (index === 0) return state;
    const prev = lines[index - 1];
    const current = lines[index];
    const at = prev.notes.length;
    lines.splice(index - 1, 2, {
      lyric: joinLyrics(prev.lyric, current.lyric),
      notes: [...prev.notes, ...current.notes],
    });
    const note = Math.min(at + (selection?.note ?? 0), lines[index - 1].notes.length - 1);
    return commit(state, {
      lines,
      selection: lines[index - 1].notes.length ? { line: index - 1, note: Math.max(0, note) } : null,
    });
  }
  const current = lines[index];
  const next = lines[index + 1];
  lines.splice(index, 2, {
    lyric: joinLyrics(current.lyric, next.lyric),
    notes: [...current.notes, ...next.notes],
  });
  return commit(state, { lines, selection: selection ? { line: index, note: selection.note } : null });
}

function joinLyrics(left: string, right: string): string {
  const a = left.trim();
  const b = right.trim();
  if (a && b) return `${a} ${b}`;
  return a || b;
}

export function canSwitchDrum(state: EditorState, drum: DrumKey): boolean {
  if (drum === state.drum) return true;
  return generateArrangement(drum, state.lines).status !== "unavailable";
}

export function switchBlockedNotes(state: EditorState): string[] {
  const generated = generateArrangement(otherDrum(state.drum), state.lines);
  if (generated.status !== "unavailable") return [];
  return generated.outOfRange.map((tongue) => tongueLabel(tongue));
}
