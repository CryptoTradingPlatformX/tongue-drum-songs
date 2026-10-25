import { describe, expect, it } from "vitest";
import { DRUM_15_CENTER, DRUM_15_OUTER, drum15Tongues } from "./drum15";
import { layoutById, noteName, tongueKey } from "./music";

describe("15-note drum placement", () => {
  it("walks clockwise from the top in the photo's pairs, longer tongue lower", () => {
    expect(DRUM_15_OUTER.map((tongue) => tongue.deg)).toEqual([3, 3, 1, 1, 6, 6, 4, 4, 5, 5, 7, 7, 2, 2]);
    expect(DRUM_15_OUTER.map((tongue) => tongue.size)).toEqual([
      "short",
      "long",
      "short",
      "long",
      "short",
      "long",
      "short",
      "long",
      "short",
      "long",
      "short",
      "long",
      "short",
      "long",
    ]);
    expect(DRUM_15_OUTER.map((tongue) => `${tongue.deg}:${tongue.oct}`)).toEqual([
      "3:1",
      "3:0",
      "1:1",
      "1:0",
      "6:0",
      "6:-1",
      "4:0",
      "4:-1",
      "5:0",
      "5:-1",
      "7:0",
      "7:-1",
      "2:1",
      "2:0",
    ]);
    expect(DRUM_15_CENTER).toEqual({ deg: 3, oct: -1 });

    for (let index = 0; index < DRUM_15_OUTER.length; index += 2) {
      const higher = DRUM_15_OUTER[index];
      const lower = DRUM_15_OUTER[index + 1];
      expect(higher.deg).toBe(lower.deg);
      expect(higher.size).toBe("short");
      expect(lower.size).toBe("long");
      expect(lower.oct).toBeLessThan(higher.oct);
      expect(lower.angle).toBeGreaterThan(higher.angle);
    }
  });

  it("covers the 15-note layout once, with no high 4 or 5", () => {
    const placed = drum15Tongues().map(tongueKey).sort();
    const layout = layoutById("15").tongues.map(tongueKey).sort();
    expect(placed).toEqual(layout);
    expect(new Set(placed).size).toBe(15);
  });

  it("names the same physical tongues in C and in D", () => {
    const label = (key: "C" | "D", tongue: { deg: number; oct: number }) => noteName(key, tongue.deg, tongue.oct);
    expect(label("D", DRUM_15_CENTER)).toBe("F#3");
    expect(label("C", DRUM_15_CENTER)).toBe("E3");
    expect(DRUM_15_OUTER.map((tongue) => label("D", tongue))).toEqual([
      "F#5",
      "F#4",
      "D5",
      "D4",
      "B4",
      "B3",
      "G4",
      "G3",
      "A4",
      "A3",
      "C#5",
      "C#4",
      "E5",
      "E4",
    ]);
    expect(DRUM_15_OUTER.map((tongue) => label("C", tongue))).toEqual([
      "E5",
      "E4",
      "C5",
      "C4",
      "A4",
      "A3",
      "F4",
      "F3",
      "G4",
      "G3",
      "B4",
      "B3",
      "D5",
      "D4",
    ]);
  });
});
