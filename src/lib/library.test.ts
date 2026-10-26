import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { filterSongs, paginate, songFitsDrum, type LibraryEntry } from "./library";
import type { Difficulty, LayoutId, Song } from "./types";

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

  it("pages a filtered list", () => {
    const all = filterSongs(songs, base);
    const page = paginate(all, 2, 24);
    expect(all.length).toBe(50);
    expect(page.pageCount).toBe(3);
    expect(page.start).toBe(25);
    expect(page.items).toHaveLength(24);
    const last = paginate(all, 3, 24);
    expect(last.start).toBe(49);
    expect(last.items).toHaveLength(2);
    expect(paginate([], 4, 24)).toMatchObject({ page: 1, pageCount: 1, start: 0, end: 0, items: [] });
  });
});

function syntheticSongs(count: number): LibraryEntry[] {
  const tags = ["folk", "hymn", "christmas", "lullaby", "dance", "classical"];
  const layouts: LayoutId[] = ["8", "11", "13", "15"];
  const difficulties: Difficulty[] = ["easy", "medium", "hard"];
  return Array.from({ length: count }, (_, index) => ({
    id: `synthetic-${index}`,
    title: `Tune ${String(index).padStart(3, "0")} ${tags[index % tags.length]}`,
    artist: `Artist ${index % 17}`,
    difficulty: difficulties[index % difficulties.length],
    tags: [tags[index % tags.length], tags[(index + 3) % tags.length]],
    minLayout: { C: layouts[index % layouts.length], D: layouts[(index + 1) % layouts.length] },
  }));
}

describe("library scale", () => {
  it("searches and filters 150 songs quickly from metadata alone", () => {
    const songs = syntheticSongs(150);
    expect(songs.every((song) => song.arrangements == null)).toBe(true);
    const started = performance.now();
    for (let index = 0; index < 50; index += 1) {
      filterSongs(songs, {
        ...base,
        text: index % 2 === 0 ? "folk" : "tune 01",
        difficulty: index % 3 === 0 ? "easy" : "all",
        tags: index % 4 === 0 ? ["hymn"] : [],
        fitsOnly: index % 5 === 0,
        drumKey: "C",
        layout: "8",
        sort: index % 2 === 0 ? "title" : "difficulty",
      });
    }
    expect(performance.now() - started).toBeLessThan(200);
    const fits = filterSongs(songs, { ...base, fitsOnly: true, drumKey: "C", layout: "8" });
    expect(fits.length).toBeGreaterThan(0);
    expect(fits.every((song) => song.minLayout?.C === "8")).toBe(true);
    expect(paginate(fits, 2, 24).items.every((song) => song.minLayout?.C === "8")).toBe(true);
  });
});
