import { describe, expect, it } from "vitest";
import { parseNotationText, serializeNotation } from "./notationText";
import type { EditorLine } from "./editor";

describe("numbered notation text", () => {
  it("round-trips degrees, octaves, rests, and lengths", () => {
    const lines: EditorLine[] = [
      {
        lyric: "",
        notes: [
          { deg: 1, oct: 0, dur: 1 },
          { deg: 1, oct: 1, dur: 0.5 },
          { deg: 5, oct: -1, dur: 0.25 },
          { deg: 3, oct: 0, dur: 2 },
          { deg: 2, oct: 0, dur: 1.5 },
          { rest: true, dur: 1 },
        ],
      },
      { lyric: "", notes: [{ deg: 6, oct: 0, dur: 0.75 }] },
    ];
    const text = serializeNotation(lines, "4/4");
    const parsed = parseNotationText(text, "C");
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.lines.map((line) => line.notes)).toEqual(lines.map((line) => line.notes));
  });

  it("points at the exact bad token and flags notes off the layout", () => {
    const bad = parseNotationText("1 8 2", "C");
    expect(bad).toMatchObject({ error: { index: 2, length: 1 } });
    const flagged = parseNotationText("3, 1", "C");
    expect("warnings" in flagged).toBe(true);
    if (!("warnings" in flagged)) return;
    expect(flagged.warnings[0]?.message).toMatch(/not on the 11-note/);
    expect(flagged.lines[0].notes[0]).toMatchObject({ deg: 3, oct: -1 });
  });

  it("treats a new line as a new phrase and ignores bar lines", () => {
    const parsed = parseNotationText("1 2 | 3\n5_", "D");
    expect("lines" in parsed).toBe(true);
    if (!("lines" in parsed)) return;
    expect(parsed.lines.map((line) => line.notes.length)).toEqual([3, 1]);
    expect(parsed.lines[1].notes[0]).toMatchObject({ deg: 5, dur: 0.5 });
  });
});
