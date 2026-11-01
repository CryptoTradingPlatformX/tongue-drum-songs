import { describe, expect, it } from "vitest";
import { noteFitsLayout, pitchCompare } from "../lib/music";
import { CHORDS, CHORD_LAYOUT, chordLabel, type ChordTone } from "./chords";

function sorted(tones: ChordTone[]): ChordTone[] {
  return [...tones].sort(pitchCompare);
}

describe("chord voicings", () => {
  it("uses only the chord's own degrees and tongues on Steven's drums", () => {
    expect(CHORD_LAYOUT).toEqual({ C: "11", D: "15" });
    for (const chord of CHORDS) {
      const degrees = new Set(chord.degrees);
      for (const key of ["C", "D"] as const) {
        for (const voicing of chord.voicings[key]) {
          expect(voicing.tones.length).toBeGreaterThan(0);
          expect(voicing.tones).toEqual(sorted(voicing.tones));
          for (const tone of voicing.tones) {
            expect(degrees.has(tone.deg)).toBe(true);
            expect(noteFitsLayout(tone.deg, tone.oct, CHORD_LAYOUT[key])).toBe(true);
          }
          if (key === "C") {
            expect(voicing.tones.some((tone) => tone.deg === 5 && tone.oct === -1)).toBe(false);
          }
        }
      }
    }
  });

  it("names each chord in both keys and leaves V7 without a voicing", () => {
    expect(chordLabel(CHORDS[4])).toBe("V = G major in C, A major in D");
    const seventh = CHORDS.find((chord) => chord.roman === "V7");
    expect(seventh?.degrees).toEqual([5, 7, 2, 4]);
    expect(seventh?.voicings.C).toEqual([]);
    expect(seventh?.voicings.D).toEqual([]);
    expect(CHORDS.map((chord) => chord.roman)).toEqual(["I", "ii", "iii", "IV", "V", "vi", "vii°", "V7"]);
  });
});
