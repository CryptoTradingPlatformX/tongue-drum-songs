import { describe, expect, it } from "vitest";
import { CHORDS } from "../data/chords";
import { noteMidi, noteName } from "./music";
import { MAJOR_KEYS, degreePitch, scaleSpelling, spelledChordName, type MajorKey } from "./pitch";

const SCALES: Record<MajorKey, string> = {
  C: "C D E F G A B",
  G: "G A B C D E F#",
  D: "D E F# G A B C#",
  A: "A B C# D E F# G#",
  E: "E F# G# A B C# D#",
  B: "B C# D# E F# G# A#",
  "F#": "F# G# A# B C# D# E#",
  Gb: "Gb Ab Bb Cb Db Eb F",
  Db: "Db Eb F Gb Ab Bb C",
  Ab: "Ab Bb C Db Eb F G",
  Eb: "Eb F G Ab Bb C D",
  Bb: "Bb C D Eb F G A",
  F: "F G A Bb C D E",
};

/** Every Steven voicing, spelled from C4 / D4. */
const VOICINGS: Record<string, string[]> = {
  "I-c-1": ["C4", "E4", "G4"],
  "I-c-2": ["C4", "E4", "G4", "C5"],
  "ii-c-1": ["D4", "F4", "A4"],
  "iii-c-1": ["E4", "G4", "B4"],
  "IV-c-1": ["F4", "A4", "C5"],
  "V-c-1": ["D4", "G4", "B4"],
  "vi-c-1": ["A3", "C4", "E4"],
  "vi-c-2": ["E4", "A4", "C5"],
  "vii-c-1": ["B3", "D4", "F4"],
  "I-d-1": ["D4", "F#4", "A4"],
  "I-d-2": ["A3", "D4", "F#4"],
  "I-d-3": ["D4", "F#4", "A4", "D5", "F#5"],
  "ii-d-1": ["E4", "G4", "B4"],
  "ii-d-2": ["B3", "E4", "G4"],
  "iii-d-1": ["F#4", "A4", "C#5"],
  "iii-d-2": ["F#3", "A3", "C#4"],
  "IV-d-1": ["G4", "B4", "D5"],
  "IV-d-2": ["G3", "B3", "D4"],
  "V-d-1": ["A4", "C#5", "E5"],
  "V-d-2": ["A3", "C#4", "E4"],
  "vi-d-1": ["B3", "D4", "F#4"],
  "vi-d-2": ["B4", "D5", "F#5"],
  "vii-d-1": ["C#4", "E4", "G4"],
  "vii-d-2": ["G4", "C#5", "E5"],
};

describe("major-scale pitch", () => {
  it("spells every listed major scale with one letter per degree", () => {
    expect(MAJOR_KEYS).toEqual(["C", "G", "D", "A", "E", "B", "F#", "Gb", "Db", "Ab", "Eb", "Bb", "F"]);
    for (const key of MAJOR_KEYS) {
      expect(scaleSpelling(key).join(" ")).toBe(SCALES[key]);
    }
  });

  it("puts enharmonic spellings on the same piano key", () => {
    expect(degreePitch("Gb", 4, 4, 0)).toMatchObject({ name: "Cb5", midi: 71 });
    expect(degreePitch("F#", 4, 7, 0)).toMatchObject({ name: "E#5", midi: 77 });
    expect(degreePitch("F", 4, 4, 0)).toMatchObject({ name: "Bb4", midi: 70 });
    expect(degreePitch("C", 4, 1, 0).midi).toBe(60);
    expect(degreePitch("D", 4, 1, 0).midi).toBe(62);
  });

  it("maps all 24 of Steven's voicings onto the expected piano notes", () => {
    const seen = new Set<string>();
    for (const chord of CHORDS) {
      for (const key of ["C", "D"] as const) {
        for (const voicing of chord.voicings[key]) {
          seen.add(voicing.id);
          const names = voicing.tones.map((tone) => degreePitch(key, 4, tone.deg, tone.oct).name);
          expect(names, voicing.id).toEqual(VOICINGS[voicing.id]);
        }
      }
    }
    expect([...seen].sort()).toEqual(Object.keys(VOICINGS).sort());
    expect(seen.size).toBe(24);
  });

  it("names chords from the scale degree and leaves the C and D drum names unchanged", () => {
    expect(spelledChordName("F", "IV")).toBe("Bb major");
    expect(spelledChordName("F", "V7")).toBe("C7");
    expect(spelledChordName("Gb", "IV")).toBe("Cb major");
    expect(spelledChordName("Gb", "vii°")).toBe("F diminished");
    expect(spelledChordName("F#", "vii°")).toBe("E# diminished");
    expect(spelledChordName("F#", "V7")).toBe("C#7");
    for (const chord of CHORDS) {
      expect(spelledChordName("C", chord.roman)).toBe(chord.name.C);
      expect(spelledChordName("D", chord.roman)).toBe(chord.name.D);
    }
  });

  it("keeps the Drum to Piano names on the same pitches", () => {
    expect(noteMidi("C", 1, 0)).toBe(degreePitch("C", 4, 1, 0).midi);
    expect(noteName("C", 4, 0)).toBe("F4");
    expect(noteName("C", 1, 1)).toBe("C5");
    expect(noteName("D", 3, -1)).toBe("F#3");
    expect(noteName("D", 7, 0)).toBe("C#5");
    expect(noteName("D", 3, 1)).toBe("F#5");
    expect(noteMidi("D", 5, 0)).toBe(degreePitch("D", 4, 5, 0).midi);
  });
});
