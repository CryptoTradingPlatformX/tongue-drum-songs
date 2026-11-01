import { describe, expect, it } from "vitest";
import { createEditor, editorReducer, type EditorState } from "./editor";

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

  it("ignores tongues the current drum does not have", () => {
    const state = editorReducer(createEditor({ drum: "C" }), { type: "appendTongue", deg: 3, oct: -1 });
    expect(state.lines[0].notes).toHaveLength(0);
  });
});
