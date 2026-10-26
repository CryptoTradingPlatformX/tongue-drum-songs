import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { songIndex } from "virtual:song-index";
import { readSongIndex } from "../../vite/songIndexPlugin";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("song index", () => {
  it("lists every song's metadata and leaves the notes in the song files", () => {
    const files = readdirSync(path.join(root, "songs")).filter((name) => name.endsWith(".json"));
    expect(songIndex).toHaveLength(files.length);
    expect(songIndex.length).toBeGreaterThan(0);
    const yankee = songIndex.find((song) => song.id === "yankee-doodle");
    expect(yankee?.minLayout).toEqual({ C: "11", D: "15" });
    expect(yankee).not.toHaveProperty("arrangements");
    expect(readSongIndex(root).map((song) => song.id).sort()).toEqual(songIndex.map((song) => song.id).sort());
  });
});
