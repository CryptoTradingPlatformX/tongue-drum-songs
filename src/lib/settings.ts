import { useEffect, useState } from "react";
import type { DrumKey, LayoutId } from "./types";

const STORAGE_KEY = "tongue-drum-settings";

export type NoteSize = "compact" | "large";

function isNoteSize(value: unknown): value is NoteSize {
  return value === "compact" || value === "large";
}

function isKey(value: unknown): value is DrumKey {
  return value === "C" || value === "D";
}

function isLayout(value: unknown): value is LayoutId {
  return value === "8" || value === "11" || value === "13" || value === "15";
}

export function useSettings() {
  const [drumKey, setDrumKey] = useState<DrumKey>("C");
  const [layout, setLayout] = useState<LayoutId>("8");
  const [noteSize, setNoteSize] = useState<NoteSize>("compact");
  const [followScroll, setFollowScroll] = useState(true);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          key?: unknown;
          layout?: unknown;
          noteSize?: unknown;
          followScroll?: unknown;
        };
        if (isKey(parsed.key)) setDrumKey(parsed.key);
        if (isLayout(parsed.layout)) setLayout(parsed.layout);
        if (isNoteSize(parsed.noteSize)) setNoteSize(parsed.noteSize);
        if (typeof parsed.followScroll === "boolean") setFollowScroll(parsed.followScroll);
      }
    } catch {
      // Ignore a broken saved preference and keep the defaults.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ key: drumKey, layout, noteSize, followScroll }),
    );
  }, [drumKey, layout, noteSize, followScroll, ready]);

  return {
    drumKey,
    setDrumKey,
    layout,
    setLayout,
    noteSize,
    setNoteSize,
    followScroll,
    setFollowScroll,
  };
}
