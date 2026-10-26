import { roundBeats } from "./music";

export const MIN_SCROLL_SPEED = 0.25;
export const MAX_SCROLL_SPEED = 3;

export function clampSpeed(speed: number): number {
  if (!Number.isFinite(speed)) return 1;
  const stepped = Math.round(speed / MIN_SCROLL_SPEED) * MIN_SCROLL_SPEED;
  const clamped = Math.min(MAX_SCROLL_SPEED, Math.max(MIN_SCROLL_SPEED, stepped));
  return Math.round(clamped * 100) / 100;
}

/** How long one notation line stays on screen. Beats are quarter-notes; tempo is quarter BPM. */
export function lineDurationMs(beats: number, bpm: number, speed: number): number {
  const rounded = roundBeats(beats);
  const safeBeats = rounded > 0 ? rounded : 1;
  const safeBpm = bpm > 0 ? bpm : 60;
  return (safeBeats * 60_000) / safeBpm / clampSpeed(speed);
}

export function linesPerMinute(beatsPerLine: number, bpm: number, speed: number): number {
  const ms = lineDurationMs(beatsPerLine, bpm, speed);
  return ms > 0 ? 60_000 / ms : 0;
}

/** Place the current line about a third of the way down, and always below sticky chrome. */
export function scrollOffset(viewportHeight: number, chromeHeight: number): number {
  return Math.max(chromeHeight, viewportHeight * 0.28);
}

export function scrollTopFor(
  elementViewportTop: number,
  scrollY: number,
  viewportHeight: number,
  chromeHeight: number,
): number {
  return Math.max(0, elementViewportTop + scrollY - scrollOffset(viewportHeight, chromeHeight));
}

export function nextScrollLine(current: number, lineCount: number): { line: number; playing: boolean } {
  if (lineCount <= 0) return { line: 0, playing: false };
  const next = current + 1;
  if (next >= lineCount) return { line: Math.max(0, lineCount - 1), playing: false };
  return { line: next, playing: true };
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
