import { DRUM_LAYOUT, generateArrangement, otherDrum, tongueLabel } from "./arrangements";
import { noteFitsLayout } from "./music";
import type { DrumKey, SongNote, TimeSignature } from "./types";

export type EditorNote = SongNote & { uncertain?: boolean };
export type EditorLine = { lyric: string; notes: EditorNote[] };

export type NoteSelection = { line: number; note: number };

type Snap = {
  title: string;
  tempo: number;
  timeSignature: TimeSignature;
  drum: DrumKey;
  lines: EditorLine[];
  selection: NoteSelection | null;
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
  | { type: "redo" };

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
    past: [],
    future: [],
  };
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
      if (!selection) return { ...state, duration: action.duration };
      const lines = cloneLines(state.lines);
      const note = lines[selection.line]?.notes[selection.note];
      if (!note) return { ...state, duration: action.duration };
      if (note.dur === action.duration && state.duration === action.duration) return state;
      lines[selection.line].notes[selection.note] = { ...note, dur: action.duration };
      return { ...commit(state, { lines }), duration: action.duration };
    }
    case "select": {
      const line = state.lines[action.line];
      if (!line || action.note < 0 || action.note >= line.notes.length) return state;
      return { ...state, selection: { line: action.line, note: action.note } };
    }
    case "appendTongue": {
      if (!fits(state, action.deg, action.oct)) return state;
      const lines = ensureLine(cloneLines(state.lines));
      const line = lines.length - 1;
      lines[line].notes.push(pitched(state.duration, action.deg, action.oct));
      return commit(state, { lines, selection: { line, note: lines[line].notes.length - 1 } });
    }
    case "appendDetected": {
      if (!fits(state, action.deg, action.oct)) return state;
      const lines = ensureLine(cloneLines(state.lines));
      const line = lines.length - 1;
      if (action.previousDur != null && lines[line].notes.length > 0) {
        const previous = lines[line].notes[lines[line].notes.length - 1];
        lines[line].notes[lines[line].notes.length - 1] = { ...previous, dur: action.previousDur };
      }
      lines[line].notes.push(
        action.uncertain
          ? { deg: action.deg, oct: action.oct, dur: action.dur, uncertain: true }
          : { deg: action.deg, oct: action.oct, dur: action.dur },
      );
      return commit(state, { lines, selection: { line, note: lines[line].notes.length - 1 } });
    }
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
    default:
      return state;
  }
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
