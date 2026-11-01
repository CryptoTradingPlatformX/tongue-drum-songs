import { describe, expect, it } from "vitest";
import { DRUM_LAYOUT } from "./arrangements";
import { detectNotes, quantizeGap, tongueAccuracy } from "./detect";
import { layoutById, noteMidi, noteName } from "./music";
import { renderStrikes, type Strike } from "./synth";
import type { DrumKey, Tongue } from "./types";

const SAMPLE_RATE = 22050;
const EXTRAS = {
  noise: 0.12,
  overtones: [
    { ratio: 5.05, gain: 0.12 },
    { ratio: 6.15, gain: 0.07 },
    { ratio: 7.4, gain: 0.04 },
  ],
  seed: 11,
};

const PIANO: Record<DrumKey, [string, number, number][]> = {
  C: [
    ["G3", 5, -1],
    ["A3", 6, -1],
    ["B3", 7, -1],
    ["C4", 1, 0],
    ["D4", 2, 0],
    ["E4", 3, 0],
    ["F4", 4, 0],
    ["G4", 5, 0],
    ["A4", 6, 0],
    ["B4", 7, 0],
    ["C5", 1, 1],
  ],
  D: [
    ["F#3", 3, -1],
    ["G3", 4, -1],
    ["A3", 5, -1],
    ["B3", 6, -1],
    ["C#4", 7, -1],
    ["D4", 1, 0],
    ["E4", 2, 0],
    ["F#4", 3, 0],
    ["G4", 4, 0],
    ["A4", 5, 0],
    ["B4", 6, 0],
    ["C#5", 7, 0],
    ["D5", 1, 1],
    ["E5", 2, 1],
    ["F#5", 3, 1],
  ],
};

function sequence(drum: DrumKey): Tongue[] {
  const tongues = layoutById(DRUM_LAYOUT[drum]).tongues;
  const pairs: Tongue[] = [
    { deg: 1, oct: 0 },
    { deg: 1, oct: 1 },
    { deg: 5, oct: -1 },
    { deg: 5, oct: 0 },
    { deg: 1, oct: 1 },
    { deg: 1, oct: 0 },
    { deg: 5, oct: 0 },
    { deg: 5, oct: -1 },
  ];
  return [...tongues, ...pairs];
}

function render(drum: DrumKey, tongues: Tongue[], gap: number) {
  const strikes: Strike[] = tongues.map((tongue, index) => ({
    midi: noteMidi(drum, tongue.deg, tongue.oct),
    at: 0.2 + index * gap,
  }));
  const seconds = strikes[strikes.length - 1].at + 1.2;
  return renderStrikes(strikes, SAMPLE_RATE, seconds, EXTRAS);
}

describe("tongue pitch map", () => {
  it("matches the drum-to-piano names, with C4 as middle C", () => {
    for (const drum of ["C", "D"] as const) {
      const names = PIANO[drum].map(([, deg, oct]) => noteName(drum, deg, oct));
      expect(names).toEqual(PIANO[drum].map(([name]) => name));
      expect(layoutById(DRUM_LAYOUT[drum]).tongues.map((tongue) => noteName(drum, tongue.deg, tongue.oct)).sort()).toEqual(
        [...names].sort(),
      );
    }
    expect(noteMidi("C", 1, 0)).toBe(60);
    expect(440 * 2 ** ((noteMidi("C", 1, 0) - 69) / 12)).toBeCloseTo(261.6256, 3);
  });
});

describe("microphone detector", () => {
  it("quantizes onset gaps onto the selected grid and keeps a default final length", () => {
    expect(quantizeGap(0.45, 120, 0.5)).toBe(1);
    expect(quantizeGap(0.2, 120, 0.5)).toBe(0.5);
    expect(quantizeGap(0.05, 100, 0.5)).toBe(0.5);
  });

  it("names at least 95% of synthesized tongues on both drums, including octave pairs", () => {
    let correct = 0;
    let total = 0;
    for (const drum of ["C", "D"] as const) {
      const expected = sequence(drum);
      const samples = render(drum, expected, 0.42);
      const detected = detectNotes(samples, SAMPLE_RATE, { drum, bpm: 100, grid: 0.5 });
      const hits = tongueAccuracy(expected, detected);
      correct += Math.round(hits * Math.max(expected.length, detected.length));
      total += Math.max(expected.length, detected.length);
      expect(detected.filter((note) => note.uncertain).length).toBeLessThan(expected.length * 0.05 + 1);
    }
    const accuracy = correct / total;
    console.log(`tongue detector accuracy ${(accuracy * 100).toFixed(1)}% (${correct}/${total})`);
    expect(accuracy).toBeGreaterThanOrEqual(0.95);
  });

  it("flags a tone that is not close to a tongue", () => {
    const samples = renderStrikes([{ midi: 60.5, at: 0.2 }], SAMPLE_RATE, 1.2, { ...EXTRAS, noise: 0.02, overtones: [] });
    const detected = detectNotes(samples, SAMPLE_RATE, { drum: "C", bpm: 100, grid: 0.5 });
    expect(detected.length).toBeGreaterThan(0);
    expect(detected[0].uncertain).toBe(true);
  });
});
