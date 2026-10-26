import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

export const SONG_INDEX_ID = "virtual:song-index";
const RESOLVED_ID = "\0virtual:song-index";

export type SongIndexRecord = {
  id: string;
  title: string;
  artist: string;
  difficulty: string;
  tags: string[];
  timeSignature: string;
  tempo: number;
  minLayout: { C: string; D: string };
};

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

function asLayout(value: unknown, file: string, key: string): string {
  if (value !== "8" && value !== "11" && value !== "13" && value !== "15") {
    throw new Error(`${file} is missing arrangements.${key}.minLayout`);
  }
  return value;
}

/** Metadata only. Song bodies stay in songs/*.json and load when a tune is opened. */
export function readSongIndex(root: string): SongIndexRecord[] {
  const dir = path.join(root, "songs");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  return files.map((name) => {
    const file = path.join(dir, name);
    const song = readJson(file);
    const arrangements = song.arrangements as { C?: { minLayout?: unknown }; D?: { minLayout?: unknown } } | undefined;
    const tags = Array.isArray(song.tags) ? song.tags.filter((tag): tag is string => typeof tag === "string") : [];
    return {
      id: String(song.id ?? ""),
      title: String(song.title ?? ""),
      artist: String(song.artist ?? ""),
      difficulty: String(song.difficulty ?? ""),
      tags,
      timeSignature: String(song.timeSignature ?? ""),
      tempo: typeof song.tempo === "number" ? song.tempo : 0,
      minLayout: {
        C: asLayout(arrangements?.C?.minLayout, name, "C"),
        D: asLayout(arrangements?.D?.minLayout, name, "D"),
      },
    };
  });
}

export function songIndexPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: "tongue-drum-song-index",
    resolveId(id) {
      if (id === SONG_INDEX_ID) return RESOLVED_ID;
    },
    load(id) {
      if (id !== RESOLVED_ID) return null;
      const dir = path.join(root, "songs");
      for (const name of readdirSync(dir)) {
        if (name.endsWith(".json")) this.addWatchFile(path.join(dir, name));
      }
      const records = readSongIndex(root);
      return `export const songIndex = ${JSON.stringify(records)};\n`;
    },
    configResolved(config) {
      root = config.root;
    },
    handleHotUpdate(context) {
      if (!context.file.endsWith(".json") || !context.file.includes(`${path.sep}songs${path.sep}`)) return;
      const mod = context.server.moduleGraph.getModuleById(RESOLVED_ID);
      if (!mod) return;
      context.server.moduleGraph.invalidateModule(mod);
      return [mod];
    },
  };
}
