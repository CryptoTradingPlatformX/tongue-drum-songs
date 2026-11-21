import type { Tongue } from "../lib/types";

export const PLAYBACK_FILL = "var(--drum-highlight)";
export const PLAYBACK_STROKE = "var(--drum-highlight-stroke)";
export const CHORD_FILL = "var(--drum-chord)";
export const CHORD_STROKE = "var(--drum-chord-stroke)";

export type TonguePaint = "play" | "chord" | null;

export function tonguePaint(active: Tongue | null, chordTones: Tongue[] | undefined, tongue: Tongue): TonguePaint {
  if (active != null && active.deg === tongue.deg && active.oct === tongue.oct) return "play";
  if (chordTones?.some((tone) => tone.deg === tongue.deg && tone.oct === tongue.oct)) return "chord";
  return null;
}

export function paintFill(paint: TonguePaint, idle: string): string {
  if (paint === "play") return PLAYBACK_FILL;
  if (paint === "chord") return CHORD_FILL;
  return idle;
}

export function paintStroke(paint: TonguePaint, idle: string): string {
  if (paint === "play") return PLAYBACK_STROKE;
  if (paint === "chord") return CHORD_STROKE;
  return idle;
}
