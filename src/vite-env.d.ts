/// <reference types="vite/client" />

declare module "virtual:song-index" {
  import type { Difficulty, LayoutId, TimeSignature } from "./lib/types";

  export type SongSummary = {
    id: string;
    title: string;
    artist: string;
    difficulty: Difficulty;
    tags: string[];
    timeSignature: TimeSignature;
    tempo: number;
    minLayout: { C: LayoutId; D: LayoutId };
  };

  export const songIndex: SongSummary[];
}
