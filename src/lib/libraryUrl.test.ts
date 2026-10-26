import { describe, expect, it } from "vitest";
import { libraryHash, parseLibraryHash } from "./libraryUrl";

describe("library URL", () => {
  it("round-trips filters and omits defaults", () => {
    expect(libraryHash(parseLibraryHash("#/"))).toBe("#/");
    expect(parseLibraryHash("")).toMatchObject({ text: "", page: 1, difficulty: "all", sort: "title" });

    const state = parseLibraryHash("#/?q=yankee&difficulty=easy&tags=folk,hymn&fits=1&sort=difficulty&page=3");
    expect(state).toEqual({
      text: "yankee",
      difficulty: "easy",
      tags: ["folk", "hymn"],
      fitsOnly: true,
      sort: "difficulty",
      page: 3,
    });
    expect(parseLibraryHash(libraryHash(state))).toEqual(state);
    expect(parseLibraryHash("#/song/yankee-doodle")).toMatchObject({ text: "", page: 1 });
    expect(parseLibraryHash("#/?difficulty=nope&page=0&sort=nope").difficulty).toBe("all");
  });
});
