import { describe, expect, it } from "vitest";
import { DRUM_LAYOUT, generateArrangement, tongueLabel } from "./arrangements";
import { layoutById } from "./music";
import type { SongLine } from "./types";

function line(notes: SongLine["notes"]): SongLine[] {
  return [{ notes }];
}

function held(deg: number, oct: number): SongLine[] {
  return line([{ deg, oct, dur: 4 }]);
}

describe("other-key arrangements", () => {
  it("copies every 11-note tongue onto the D drum", () => {
    for (const tongue of layoutById("11").tongues) {
      const generated = generateArrangement("D", held(tongue.deg, tongue.oct));
      expect(generated.status).toBe("ready");
    }
    const all = generateArrangement(
      "D",
      line(layoutById("11").tongues.map((tongue) => ({ deg: tongue.deg, oct: tongue.oct, dur: 1 }))),
    );
    expect(all.status).toBe("ready");
    if (all.status === "ready") expect(all.minLayout).toBe("11");
  });

  it("marks D-only tongues unavailable on the C drum and lists them", () => {
    const only = [
      { deg: 3, oct: -1, label: "low 3" },
      { deg: 4, oct: -1, label: "low 4" },
      { deg: 2, oct: 1, label: "high 2" },
      { deg: 3, oct: 1, label: "high 3" },
    ];
    for (const tongue of only) {
      const generated = generateArrangement("C", held(tongue.deg, tongue.oct));
      expect(generated.status).toBe("unavailable");
      if (generated.status === "unavailable") {
        expect(generated.outOfRange.map(tongueLabel)).toEqual([tongue.label]);
      }
    }
    const together = generateArrangement(
      "C",
      line([
        { deg: 3, oct: -1, dur: 1 },
        { deg: 4, oct: -1, dur: 1 },
        { deg: 2, oct: 1, dur: 1 },
        { deg: 3, oct: 1, dur: 1 },
      ]),
    );
    expect(together.status).toBe("unavailable");
    if (together.status === "unavailable") {
      expect(together.outOfRange.map(tongueLabel)).toEqual(["low 3", "low 4", "high 2", "high 3"]);
    }
  });

  it("stores the smallest layout that can play the notes", () => {
    const low = generateArrangement("D", held(3, -1));
    expect(low.status).toBe("ready");
    if (low.status === "ready") expect(low.minLayout).toBe("15");
    const high = generateArrangement("C", held(1, 1));
    expect(high.status).toBe("ready");
    if (high.status === "ready") expect(high.minLayout).toBe("8");
    expect(DRUM_LAYOUT).toEqual({ C: "11", D: "15" });
  });

  it("does not invent an arrangement for an empty song", () => {
    expect(generateArrangement("C", [{ notes: [] }]).status).toBe("empty");
    expect(generateArrangement("D", []).status).toBe("empty");
  });
});
