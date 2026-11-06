import { describe, expect, it } from "vitest";
import { barFills, createEditor, editorReducer, selectedNotes, type EditorState } from "./editor";

function tap(state: EditorState, deg: number, oct = 0): EditorState {
  return editorReducer(state, { type: "appendTongue", deg, oct });
}

describe("editor reducer", () => {
  it("appends notes and rests at the selected duration", () => {
    let state = editorReducer(createEditor(), { type: "setDuration", duration: 0.5 });
    state = tap(state, 1);
    state = editorReducer(state, { type: "appendRest" });
    state = tap(state, 3);
    expect(state.lines[0].notes).toEqual([
      { deg: 1, oct: 0, dur: 0.5 },
      { rest: true, dur: 0.5 },
      { deg: 3, oct: 0, dur: 0.5 },
    ]);
    expect(state.selection).toEqual({ line: 0, note: 2 });
  });

  it("edits the selected note, inserts, and deletes", () => {
    let state = tap(tap(createEditor(), 1), 2);
    state = editorReducer(state, { type: "select", line: 0, note: 0 });
    state = editorReducer(state, { type: "setTongue", deg: 5, oct: -1 });
    state = editorReducer(state, { type: "setDuration", duration: 2 });
    state = editorReducer(state, { type: "insertRest" });
    expect(state.lines[0].notes.map((note) => note.rest === true || note.dur)).toEqual([true, 2, 1]);
    expect(state.lines[0].notes[1]).toMatchObject({ deg: 5, oct: -1, dur: 2 });
    state = editorReducer(state, { type: "deleteNote" });
    expect(state.lines[0].notes).toHaveLength(2);
    expect(state.lines[0].notes[0]).toMatchObject({ deg: 5, oct: -1, dur: 2 });
  });

  it("splits and merges lines and edits a lyric", () => {
    let state = tap(tap(tap(createEditor(), 1), 2), 3);
    state = editorReducer(state, { type: "select", line: 0, note: 1 });
    state = editorReducer(state, { type: "splitLine" });
    expect(state.lines.map((line) => line.notes.length)).toEqual([1, 2]);
    state = editorReducer(state, { type: "setLyric", line: 0, lyric: "Hello" });
    state = editorReducer(state, { type: "setLyric", line: 1, lyric: "there" });
    state = editorReducer(state, { type: "mergeLine" });
    expect(state.lines).toHaveLength(1);
    expect(state.lines[0].lyric).toBe("Hello there");
    expect(state.lines[0].notes).toHaveLength(3);
  });

  it("undoes and redoes musical edits", () => {
    let state = tap(createEditor({ title: "First" }), 1);
    state = editorReducer(state, { type: "setTitle", title: "Second" });
    state = editorReducer(state, { type: "undo" });
    expect(state.title).toBe("First");
    expect(state.lines[0].notes).toHaveLength(1);
    state = editorReducer(state, { type: "undo" });
    expect(state.lines[0].notes).toHaveLength(0);
    state = editorReducer(state, { type: "redo" });
    expect(state.lines[0].notes[0]).toMatchObject({ deg: 1, oct: 0 });
    expect(state.title).toBe("First");
  });

  it("refuses a drum switch when notes would fall off that layout", () => {
    let state = createEditor({ drum: "D" });
    state = tap(state, 3, -1);
    const blocked = editorReducer(state, { type: "setDrum", drum: "C" });
    expect(blocked.drum).toBe("D");
    expect(blocked.lines).toEqual(state.lines);
    const allowed = editorReducer(tap(createEditor({ drum: "C" }), 1, 1), { type: "setDrum", drum: "D" });
    expect(allowed.drum).toBe("D");
    expect(allowed.lines[0].notes[0]).toMatchObject({ deg: 1, oct: 1 });
  });

  it("appends a detected note and lets the player replace a question mark", () => {
    let state = editorReducer(createEditor(), {
      type: "appendDetected",
      deg: 1,
      oct: 0,
      dur: 0.5,
      uncertain: true,
    });
    expect(state.lines[0].notes[0]).toMatchObject({ deg: 1, oct: 0, dur: 0.5, uncertain: true });
    state = editorReducer(state, {
      type: "appendDetected",
      deg: 2,
      oct: 0,
      dur: 0.5,
      uncertain: false,
      previousDur: 1,
    });
    expect(state.lines[0].notes[0].dur).toBe(1);
    expect(state.lines[0].notes[0].uncertain).toBe(true);
    state = editorReducer(state, { type: "select", line: 0, note: 0 });
    state = editorReducer(state, { type: "setTongue", deg: 3, oct: 0 });
    expect(state.lines[0].notes[0]).toEqual({ deg: 3, oct: 0, dur: 1 });
  });

  it("lands a recording at the caret and keeps an uncertain note selected", () => {
    let state = ["1", "2", "3"].reduce(
      (current, deg) => editorReducer(current, { type: "strike", deg: Number(deg), oct: 0 }),
      createEditor(),
    );
    state = editorReducer(state, { type: "moveCaret", line: 0, index: 1 });
    state = editorReducer(state, { type: "appendDetected", deg: 5, oct: 0, dur: 1, uncertain: true });
    expect(state.lines[0].notes.map((note) => note.deg)).toEqual([1, 5, 2, 3]);
    expect(state.selection).toEqual({ line: 0, note: 1 });
    expect(state.caret).toEqual({ line: 0, index: 2 });
    state = editorReducer(state, { type: "appendDetected", deg: 6, oct: 0, dur: 0.5, uncertain: false, previousDur: 2 });
    expect(state.lines[0].notes[1]).toMatchObject({ deg: 5, dur: 2, uncertain: true });
    expect(state.lines[0].notes.map((note) => note.deg)).toEqual([1, 5, 6, 2, 3]);
    expect(state.selection).toBeNull();
  });

  it("inserts at the caret, overwrites a selected note, and breaks long lines", () => {
    let state = editorReducer(createEditor({ timeSignature: "2/4", barsPerLine: 1 }), { type: "setDuration", duration: 1 });
    state = editorReducer(state, { type: "strike", deg: 1, oct: 0 });
    state = editorReducer(state, { type: "strike", deg: 2, oct: 0 });
    state = editorReducer(state, { type: "strike", deg: 3, oct: 0 });
    expect(state.lines.map((line) => line.notes.length)).toEqual([2, 1]);
    expect(barFills(state.lines[0].notes, "2/4")).toEqual(["complete"]);
    expect(barFills([{ dur: 1 }, { dur: 1 }, { dur: 1 }], "2/4")).toEqual(["complete", "short"]);
    state = editorReducer(state, { type: "select", line: 0, note: 0 });
    state = editorReducer(state, { type: "strike", deg: 5, oct: 0 });
    expect(state.lines[0].notes[0]).toMatchObject({ deg: 5 });
    expect(state.selection).toEqual({ line: 0, note: 1 });
  });

  it("moves the caret from the keyboard and edits a range", () => {
    let state = ["1", "2", "3", "4"].reduce((current, deg) => editorReducer(current, { type: "strike", deg: Number(deg), oct: 0 }), createEditor());
    state = editorReducer(state, { type: "moveCaret", line: 0, index: 1 });
    state = editorReducer(state, { type: "deleteBackward" });
    expect(state.lines[0].notes.map((note) => note.deg)).toEqual([2, 3, 4]);
    state = editorReducer(state, { type: "select", line: 0, note: 0 });
    state = editorReducer(state, { type: "selectRange", line: 0, note: 1 });
    const copied = selectedNotes(state);
    expect(copied.map((note) => note.deg)).toEqual([2, 3]);
    state = editorReducer(state, { type: "shiftRange", steps: 1 });
    expect(state.lines[0].notes.map((note) => note.deg)).toEqual([3, 4, 4]);
    state = editorReducer(state, { type: "moveCaret", line: 0, index: 3 });
    state = editorReducer(state, { type: "paste", notes: copied });
    expect(state.lines[0].notes.map((note) => note.deg)).toEqual([3, 4, 4, 2, 3]);
    state = editorReducer(state, { type: "selectAll" });
    state = editorReducer(state, { type: "clearAll" });
    expect(state.lines[0].notes).toEqual([]);
  });

  it("ignores tongues the current drum does not have", () => {
    const state = editorReducer(createEditor({ drum: "C" }), { type: "appendTongue", deg: 3, oct: -1 });
    expect(state.lines[0].notes).toHaveLength(0);
  });
});
