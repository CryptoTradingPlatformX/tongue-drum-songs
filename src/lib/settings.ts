import { useEffect, useState } from "react";
import type { DrumKey, LayoutId } from "./types";

const STORAGE_KEY = "tongue-drum-settings";

function isKey(value: unknown): value is DrumKey {
  return value === "C" || value === "D";
}

function isLayout(value: unknown): value is LayoutId {
  return value === "8" || value === "11" || value === "13" || value === "15";
}

export function useSettings() {
  const [drumKey, setDrumKey] = useState<DrumKey>("C");
  const [layout, setLayout] = useState<LayoutId>("8");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { key?: unknown; layout?: unknown };
        if (isKey(parsed.key)) setDrumKey(parsed.key);
        if (isLayout(parsed.layout)) setLayout(parsed.layout);
      }
    } catch {
      // Ignore a broken saved preference and keep the defaults.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ key: drumKey, layout }));
  }, [drumKey, layout, ready]);

  return { drumKey, setDrumKey, layout, setLayout };
}
