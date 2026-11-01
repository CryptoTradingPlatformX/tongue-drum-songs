import { describe, expect, it } from "vitest";
import { layoutById, noteName, tongueKey } from "../lib/music";
import { PIANO_LAYOUT, PIANO_TONGUES, PIANO_WHITE_KEYS } from "./piano";

describe("drum to piano map", () => {
  it("matches noteName and the 11-note and 15-note layouts exactly", () => {
    expect(PIANO_LAYOUT).toEqual({ C: "11", D: "15" });
    expect(PIANO_WHITE_KEYS[0]).toBe("F3");
    expect(PIANO_WHITE_KEYS.at(-1)).toBe("G5");
    expect(PIANO_WHITE_KEYS).toContain("C4");
    expect(PIANO_WHITE_KEYS).toContain("F5");

    for (const key of ["C", "D"] as const) {
      const mapped = PIANO_TONGUES[key].map((tongue) => `${tongue.deg}:${tongue.oct}`).sort();
      const layout = layoutById(PIANO_LAYOUT[key]).tongues.map(tongueKey).sort();
      expect(mapped).toEqual(layout);
      expect(new Set(mapped).size).toBe(mapped.length);
      for (const tongue of PIANO_TONGUES[key]) {
        expect(noteName(key, tongue.deg, tongue.oct)).toBe(tongue.name);
        expect(tongue.black).toBe(tongue.name.includes("#"));
      }
    }

    expect(PIANO_TONGUES.C.map((tongue) => tongue.name)).toEqual([
      "G3",
      "A3",
      "B3",
      "C4",
      "D4",
      "E4",
      "F4",
      "G4",
      "A4",
      "B4",
      "C5",
    ]);
    expect(PIANO_TONGUES.C.filter((tongue) => tongue.centerLikely).map((tongue) => tongue.name)).toEqual(["G3"]);
    expect(PIANO_TONGUES.D.map((tongue) => tongue.name)).toEqual([
      "F#3",
      "G3",
      "A3",
      "B3",
      "C#4",
      "D4",
      "E4",
      "F#4",
      "G4",
      "A4",
      "B4",
      "C#5",
      "D5",
      "E5",
      "F#5",
    ]);
  });
});
