import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createEditor, editorReducer } from "./editor";
import {
  allocateId,
  buildPersonalSong,
  exportSongs,
  importSongDocuments,
  issuesForPersonalSong,
  isPlayable,
} from "./mySongs";
import { validateSongDocument } from "./validateSong";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function fourQuarters(drum: "C" | "D", title: string, notes: { deg: number; oct: number }[]) {
  let state = createEditor({ drum, title, timeSignature: "4/4", tempo: 96 });
  for (const note of notes) state = editorReducer(state, { type: "appendTongue", deg: note.deg, oct: note.oct });
  const built = buildPersonalSong(state, allocateId(`my-${title}`, new Set()));
  if ("error" in built) throw new Error(built.error);
  return built.song;
}

describe("personal song import and export", () => {
  it("saves a C song the shared validator accepts, including the generated D arrangement", async () => {
    const song = await fourQuarters("C", "evening", [
      { deg: 1, oct: 0 },
      { deg: 2, oct: 0 },
      { deg: 3, oct: 0 },
      { deg: 5, oct: -1 },
    ]);
    expect(song.license).toBe("personal");
    expect(song.attribution).toBe("Created by you");
    expect(song.id.startsWith("my-")).toBe(true);
    expect(isPlayable(song.arrangements.C)).toBe(true);
    expect(isPlayable(song.arrangements.D)).toBe(true);
    if (isPlayable(song.arrangements.D) && isPlayable(song.arrangements.C)) {
      expect(song.arrangements.D.lines).toEqual(song.arrangements.C.lines);
    }
    expect(await issuesForPersonalSong(song)).toEqual([]);
  });

  it("lists out-of-range notes instead of saving them on the other drum", async () => {
    const song = await fourQuarters("D", "below", [
      { deg: 3, oct: -1 },
      { deg: 4, oct: -1 },
      { deg: 2, oct: 1 },
      { deg: 3, oct: 1 },
    ]);
    expect(isPlayable(song.arrangements.D)).toBe(true);
    expect(song.arrangements.C).toEqual({
      unavailable: { notes: ["low 3", "low 4", "high 2", "high 3"] },
    });
    expect(JSON.stringify(song.arrangements.C)).not.toContain("deg");
    expect(await issuesForPersonalSong(song)).toEqual([]);
  });

  it("rejects an arrangement that stores notes the drum cannot play", async () => {
    const song = await fourQuarters("D", "below", [{ deg: 1, oct: 0 }, { deg: 1, oct: 0 }, { deg: 1, oct: 0 }, { deg: 1, oct: 0 }]);
    const broken = {
      ...song,
      arrangements: {
        ...song.arrangements,
        C: {
          minLayout: "11",
          lines: [{ notes: [{ deg: 3, oct: -1, dur: 4 }] }],
        },
      },
    };
    const failures = await validateSongDocument(broken);
    expect(failures.some((failure) => failure.field.includes("minLayout"))).toBe(true);
  });

  it("imports a song or an array, rewrites identity, and resolves id collisions", async () => {
    const song = await fourQuarters("C", "round", [
      { deg: 1, oct: 0 },
      { deg: 1, oct: 0 },
      { deg: 1, oct: 0 },
      { deg: 1, oct: 0 },
    ]);
    const libraryShaped = { ...song, id: "ode-to-joy", license: "public-domain", attribution: "Melody: Beethoven" };
    const first = await importSongDocuments(libraryShaped, new Set());
    expect(first.errors).toEqual([]);
    expect(first.songs).toHaveLength(1);
    expect(first.songs[0].id).toBe("my-ode-to-joy");
    expect(first.songs[0].license).toBe("personal");
    expect(first.songs[0].attribution).toBe("Created by you");

    const again = await importSongDocuments([song, song, { schemaVersion: 1 }], new Set([first.songs[0].id]));
    expect(again.songs.map((item) => item.id)).toEqual([song.id, `${song.id}-2`]);
    expect(again.errors.map((issue) => issue.index)).toEqual([2]);
    expect(again.errors[0].messages.length).toBeGreaterThan(0);
    expect(exportSongs(again.songs)).toEqual(again.songs);
    expect(exportSongs([again.songs[0]])).toEqual(again.songs[0]);
  });

  it("still accepts a library song file", async () => {
    const name = readdirSync(path.join(root, "songs")).find((file) => file.endsWith(".json"));
    expect(name).toBeTruthy();
    const data = JSON.parse(readFileSync(path.join(root, "songs", name!), "utf8"));
    expect(await validateSongDocument(data, { file: `songs/${name}` })).toEqual([]);
  });
});
