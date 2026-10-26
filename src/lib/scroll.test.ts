import { describe, expect, it } from "vitest";
import { clampSpeed, lineDurationMs, linesPerMinute, nextScrollLine, scrollOffset, scrollTopFor } from "./scroll";

describe("auto-scroll timing", () => {
  it("follows quarter-note tempo and the speed multiplier", () => {
    expect(lineDurationMs(4, 60, 1)).toBe(4000);
    expect(lineDurationMs(4, 120, 1)).toBe(2000);
    expect(lineDurationMs(4, 60, 2)).toBe(2000);
    expect(lineDurationMs(4, 60, 0.25)).toBe(16000);
    expect(lineDurationMs(4.5, 60, 1)).toBe(4500);
    expect(lineDurationMs(6, 60, 1)).toBe(6000);
    expect(lineDurationMs(9, 60, 1)).toBe(9000);
    expect(lineDurationMs(4, 60, 4)).toBeCloseTo(4000 / 3);
    expect(clampSpeed(0.1)).toBe(0.25);
    expect(clampSpeed(9)).toBe(3);
  });

  it("turns beats per line and BPM into lines per minute", () => {
    expect(linesPerMinute(4, 60, 1)).toBe(15);
    expect(linesPerMinute(4, 96, 1)).toBeCloseTo(24);
  });

  it("stops after the last line and keeps the current line in the upper third", () => {
    expect(nextScrollLine(0, 3)).toEqual({ line: 1, playing: true });
    expect(nextScrollLine(2, 3)).toEqual({ line: 2, playing: false });
    expect(scrollOffset(900, 0)).toBeCloseTo(252);
    expect(scrollOffset(900, 300)).toBe(300);
    expect(scrollTopFor(400, 1000, 900, 0)).toBeCloseTo(1400 - 252);
  });
});
