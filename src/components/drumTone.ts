import type { Tongue } from "../lib/types";

export const PLAYBACK_FILL = "#f6c445";
export const PLAYBACK_STROKE = "#8a3b1c";
export const CHORD_FILL = "#2a9d8f";
export const CHORD_STROKE = "#0f5c56";

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
