import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { filterSongs, songFitsDrum } from "./library";
import type { Song } from "./types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadSongs(): Song[] {
  return readdirSync(path.join(root, "songs"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(path.join(root, "songs", name), "utf8")) as Song);
}

const base = {
  text: "",
  difficulty: "all" as const,
  tags: [] as string[],
  fitsOnly: false,
  sort: "title" as const,
  drumKey: "C" as const,
  layout: "8" as const,
};

describe("library browsing", () => {
  const songs = loadSongs();

  it("searches title, artist, and tags, and sorts by title or difficulty", () => {
    const byTag = filterSongs(songs, { ...base, text: "christmas" });
    expect(byTag.length).toBeGreaterThan(0);
    expect(byTag.every((song) => song.tags?.includes("christmas") || /christmas/i.test(`${song.title} ${song.artist}`))).toBe(
      true,
    );

    const titled = filterSongs(songs, { ...base, text: "yankee" });
    expect(titled.map((song) => song.id)).toEqual(["yankee-doodle"]);

    const byDifficulty = filterSongs(songs, { ...base, sort: "difficulty" });
    const ranks = byDifficulty.map((song) => song.difficulty);
    const order = ["easy", "medium", "hard"];
    expect(ranks).toEqual([...ranks].sort((a, b) => order.indexOf(a) - order.indexOf(b)));

    const easyFolk = filterSongs(songs, { ...base, difficulty: "easy", tags: ["folk"] });
    expect(easyFolk.every((song) => song.difficulty === "easy" && song.tags?.includes("folk"))).toBe(true);
  });

  it("filters fits-my-drum with the selected key and layout", () => {
    const yankee = songs.find((song) => song.id === "yankee-doodle");
    const canon = songs.find((song) => song.id === "pachelbel-canon");
    expect(yankee && songFitsDrum(yankee, "C", "11")).toBe(true);
    expect(yankee && songFitsDrum(yankee, "D", "11")).toBe(false);
    expect(yankee && songFitsDrum(yankee, "D", "15")).toBe(true);
    expect(canon && songFitsDrum(canon, "C", "11")).toBe(true);
    expect(canon && songFitsDrum(canon, "D", "11")).toBe(false);
    expect(canon && songFitsDrum(canon, "D", "13")).toBe(true);

    const onD11 = filterSongs(songs, { ...base, text: "yankee", fitsOnly: true, drumKey: "D", layout: "11" });
    expect(onD11).toEqual([]);
    const onC11 = filterSongs(songs, { ...base, text: "yankee", fitsOnly: true, drumKey: "C", layout: "11" });
    expect(onC11.map((song) => song.id)).toEqual(["yankee-doodle"]);

    const hymnOn8 = filterSongs(songs, { ...base, tags: ["hymn"], fitsOnly: true, drumKey: "C", layout: "8" });
    expect(hymnOn8.every((song) => songFitsDrum(song, "C", "8") && song.tags?.includes("hymn"))).toBe(true);
  });
});
