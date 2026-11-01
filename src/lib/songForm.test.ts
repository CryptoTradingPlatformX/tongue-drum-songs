import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import { flattenLines, parseNote } from "./music";
import type { Song, SongNote, VerseLinePair } from "./types";
import {
  arrangementBeats,
  expandArrangement,
  formatClock,
  formProblems,
  playbackSeconds,
  verseIndicator,
} from "./songForm";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fixtureDir = path.join(root, "src/lib/fixtures/form");
const schema = JSON.parse(readFileSync(path.join(root, "schemas/song.schema.json"), "utf8")) as object;
const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

function load(name: string): Song {
  return JSON.parse(readFileSync(path.join(fixtureDir, name), "utf8")) as Song;
}

function clone(song: Song): Song {
  return JSON.parse(JSON.stringify(song)) as Song;
}

describe("form validator", () => {
  const valid = load("valid.json");

  it("accepts a form whose verses match the written lyrics", () => {
    expect(validate(valid)).toBe(true);
    expect(formProblems(valid)).toEqual([]);
  });

  it("rejects verses when form is absent", () => {
    const song = clone(valid);
    delete song.form;
    expect(formProblems(song).map((problem) => problem.error)).toContain("verses requires form");
  });

  it("rejects a line with no section when form is set", () => {
    const song = clone(valid);
    delete song.arrangements.C.lines[0].section;
    delete song.arrangements.D.lines[0].section;
    expect(formProblems(song).some((problem) => problem.error.includes("every line needs a section"))).toBe(true);
  });

  it("rejects a different section sequence or line count", () => {
    const mismatched = clone(valid);
    mismatched.arrangements.D.lines[1].section = "verse";
    expect(formProblems(mismatched).some((problem) => problem.error.includes("must match D section"))).toBe(true);

    const shorter = clone(valid);
    shorter.arrangements.D.lines.pop();
    expect(formProblems(shorter).some((problem) => problem.error.includes("same number of lines"))).toBe(true);
  });

  it("rejects a form entry for an unknown section and a section missing from form", () => {
    const unknown = clone(valid);
    unknown.form = [...(unknown.form ?? []), { section: "bridge" }];
    expect(formProblems(unknown).some((problem) => problem.error.includes("not on any line"))).toBe(true);

    const omitted = clone(valid);
    omitted.form = (omitted.form ?? []).filter((entry) => entry.section !== "refrain");
    expect(formProblems(omitted).some((problem) => problem.error.includes('section "refrain" never appears'))).toBe(true);
  });

  it("requires verse numbers only for sections listed in verses", () => {
    const missing = clone(valid);
    missing.form = (missing.form ?? []).map((entry) =>
      entry.section === "verse" ? { section: "verse" } : entry,
    );
    expect(formProblems(missing).some((problem) => problem.error.includes("needs verse"))).toBe(true);

    const numbered = clone(valid);
    numbered.form = (numbered.form ?? []).map((entry) =>
      entry.section === "refrain" ? { section: "refrain", verse: 1 } : entry,
    );
    expect(formProblems(numbered).some((problem) => problem.error.includes("must not set verse"))).toBe(true);
  });

  it("rejects a missing verse row and a row of the wrong length", () => {
    const missing = clone(valid);
    missing.form = [...(missing.form ?? []), { section: "verse", verse: 9 }];
    expect(formProblems(missing).some((problem) => problem.error.includes("does not exist"))).toBe(true);

    const short = clone(valid);
    short.verses = { verse: (short.verses?.verse ?? []).map((row) => row.slice(0, 1)) };
    expect(formProblems(short).some((problem) => problem.error.includes("expected 2"))).toBe(true);
  });

  it("requires verse 1 to equal the lines' own lyrics", () => {
    const song = clone(valid);
    const rows = song.verses?.verse?.map((row) => [...row]) ?? [];
    rows[0] = ["Wrong line", "Line B one"];
    song.verses = { verse: rows };
    expect(formProblems(song).some((problem) => problem.field === "/verses/verse/0")).toBe(true);
  });

  it("rejects a section slug that is not lowercase", () => {
    const song = clone(valid);
    song.arrangements.C.lines[0].section = "Verse";
    song.arrangements.D.lines[0].section = "Verse";
    expect(validate(song)).toBe(false);
  });
});

describe("invalid form fixtures", () => {
  const cases: Array<[string, string]> = [
    ["verses-without-form.json", "verses requires form"],
    ["missing-section.json", "every line needs a section"],
    ["section-mismatch.json", "must match D section"],
    ["unknown-section.json", "not on any line"],
    ["section-not-in-form.json", 'section "refrain" never appears'],
    ["missing-verse-number.json", "needs verse"],
    ["verse-out-of-range.json", "does not exist"],
    ["verse-length-mismatch.json", "expected 2"],
    ["verse-on-plain-section.json", "must not set verse"],
    ["verse-zero-lyric-mismatch.json", "must equal the section lyrics"],
  ];

  it.each(cases)("%s fails with %s", (file, message) => {
    const song = load(file);
    expect(formProblems(song).some((problem) => problem.error.includes(message))).toBe(true);
  });

  it("rejects a section slug that fails the schema", () => {
    expect(validate(load("bad-section-slug.json"))).toBe(false);
  });
});

describe("expanded playback", () => {
  const song = load("valid.json");

  it("repeats non-contiguous section lines and swaps lyrics", () => {
    const lines = expandArrangement(song, "C");
    expect(lines.map((line) => line.heading).filter(Boolean)).toEqual([
      "Verse 1",
      "Refrain",
      "Verse 2",
      "Refrain",
      "Verse 3",
      "Refrain",
      "Verse 4",
      "Refrain",
      "Verse 5",
    ]);
    const verseTwo = lines.filter((line) => line.verse === 2);
    expect(verseTwo.map((line) => line.lyric)).toEqual(["Line A two", "Line B two"]);
    expect(verseTwo[0].notes.map((note) => note.deg)).toEqual([1, 2, 3, 1]);
    expect(verseTwo[1].notes.map((note) => note.deg)).toEqual([1, 3, 5, 3]);
    expect(verseIndicator(verseTwo[0])).toBe("Verse 2 of 5");
    expect(verseIndicator(lines.find((line) => line.section === "refrain"))).toBe("Refrain");
    expect(arrangementBeats(lines)).toBe(56);
    expect(formatClock(playbackSeconds(56, song.tempo))).toBe("0:17");
  });

  it("leaves a song without form as a single pass", () => {
    const plain = clonePlain();
    const lines = expandArrangement(plain, "D");
    expect(lines).toHaveLength(plain.arrangements.D.lines.length);
    expect(lines.every((line) => line.heading == null && line.section == null)).toBe(true);
    expect(verseIndicator(lines[0])).toBeNull();
  });
});

const fitting: SongNote[] = [
  { deg: 1, oct: 0, dur: 2 },
  { deg: 2, oct: 0, dur: 2 },
  { deg: 3, oct: 0, dur: 2 },
];

function pair(c: Partial<VerseLinePair["C"]>, d: Partial<VerseLinePair["D"]> = {}): VerseLinePair {
  return {
    C: { notes: fitting, ...c },
    D: { notes: fitting, ...d },
  };
}

function withVerseLines(song: Song, verseLines: NonNullable<Song["verseLines"]>): Song {
  const next = clone(song);
  next.verseLines = verseLines;
  return next;
}

describe("verse line variants", () => {
  const valid = load("valid.json");

  it("uses variant notes and falls back to the shared verse lyric", () => {
    const song = withVerseLines(valid, {
      verse: {
        "2": {
          "0": pair({}),
          "1": pair({ lyric: "Line B two" }, { lyric: "Line B two", notes: [{ deg: 5, oct: 0, dur: 4 }] }),
        },
      },
    });
    expect(validate(song)).toBe(true);
    expect(formProblems(song)).toEqual([]);

    const cLines = expandArrangement(song, "C");
    const verseTwo = cLines.filter((line) => line.verse === 2);
    expect(verseTwo[0].notes).toEqual(fitting);
    expect(verseTwo[0].lyric).toBe("Line A two");
    expect(verseTwo[1].lyric).toBe("Line B two");
    expect(verseTwo[1].notes.map((note) => note.deg)).toEqual([1, 2, 3]);
    expect(cLines.filter((line) => line.verse === 1)[0].notes.map((note) => note.deg)).toEqual([1, 2, 3, 1]);
    expect(verseIndicator(verseTwo[0])).toBe("Verse 2 of 5");

    const dLines = expandArrangement(song, "D");
    const dVerseTwo = dLines.filter((line) => line.verse === 2);
    expect(dVerseTwo[1].notes).toEqual([{ deg: 5, oct: 0, dur: 4 }]);
    expect(arrangementBeats(cLines)).toBe(60);
    expect(arrangementBeats(dLines)).toBe(58);
    expect(formatClock(playbackSeconds(arrangementBeats(cLines), song.tempo))).toBe("0:18");
    expect(formatClock(playbackSeconds(arrangementBeats(dLines), song.tempo))).toBe("0:17");

    const verseTwoIndex = cLines.findIndex((line) => line.verse === 2);
    const events = flattenLines(cLines.map((line) => ({ notes: line.notes.map((note) => parseNote(note)) })));
    const cursor = events.filter((event) => event.lineIndex === verseTwoIndex);
    expect(cursor.map((event) => event.dur)).toEqual([2, 2, 2]);
    expect(cursor.every((event) => event.lineIndex === verseTwoIndex)).toBe(true);
  });

  it("ignores a section field on a variant and still plays that variant", () => {
    const song = withVerseLines(valid, {
      verse: { "3": { "0": pair({}) } },
    });
    const variant = song.verseLines?.verse["3"]["0"].C as { section?: string };
    variant.section = "refrain";
    const line = expandArrangement(song, "C").find((item) => item.verse === 3);
    expect(line?.section).toBe("verse");
    expect(line?.notes).toEqual(fitting);
    expect(validate(song)).toBe(false);
  });

  it("rejects verseLines when form is absent", () => {
    const song = withVerseLines(valid, { verse: { "1": { "0": pair({}) } } });
    delete song.form;
    expect(formProblems(song).map((problem) => problem.error)).toContain("verseLines requires form");
  });

  it("rejects a section that is missing or not listed in verses", () => {
    const unknown = withVerseLines(valid, { bridge: { "1": { "0": pair({}) } } });
    expect(formProblems(unknown).some((problem) => problem.error.includes('section "bridge" is not a section'))).toBe(
      true,
    );

    const refrain = withVerseLines(valid, { refrain: { "1": { "0": pair({}) } } });
    expect(formProblems(refrain).some((problem) => problem.error.includes('section "refrain" is not in verses'))).toBe(
      true,
    );
  });

  it("rejects a verse number that is not in verses[section]", () => {
    const song = withVerseLines(valid, { verse: { "9": { "0": pair({}) } } });
    expect(formProblems(song).some((problem) => problem.error.includes('verse 9 of "verse" does not exist'))).toBe(true);

    const zero = withVerseLines(valid, { verse: { "0": { "0": pair({}) } } });
    expect(formProblems(zero).some((problem) => problem.error.includes('verse "0"'))).toBe(true);
    expect(validate(zero)).toBe(false);
  });

  it("rejects a line index outside that section's line count", () => {
    const song = withVerseLines(valid, { verse: { "2": { "2": pair({}) } } });
    expect(formProblems(song).some((problem) => problem.error.includes("outside that section's line count"))).toBe(true);
    expect(validate(song)).toBe(true);
  });

  it("rejects a variant that is missing C or D", () => {
    const song = withVerseLines(valid, { verse: { "2": { "0": pair({}) } } });
    delete (song.verseLines?.verse["2"]["0"] as { D?: unknown }).D;
    expect(formProblems(song).some((problem) => problem.error.includes("needs both C and D"))).toBe(true);
    expect(validate(song)).toBe(false);
  });

  it("rejects notes that do not fit that key's minLayout", () => {
    const lowFive: SongNote[] = [{ deg: 5, oct: -1, dur: 4 }];
    const song = withVerseLines(valid, {
      verse: { "2": { "0": { C: { notes: lowFive }, D: { notes: fitting } } } },
    });
    const problems = formProblems(song);
    expect(problems.some((problem) => problem.field.endsWith("/C/notes") && problem.error.includes("8-note layout"))).toBe(
      true,
    );
    expect(problems.some((problem) => problem.field.endsWith("/D/notes"))).toBe(false);

    song.arrangements.C.minLayout = "11";
    expect(formProblems(song).filter((problem) => problem.field.includes("/verseLines"))).toEqual([]);
  });

  it("accepts variant notes that fit minLayout when a smaller layout would also fit", () => {
    const song = withVerseLines(valid, { verse: { "2": { "0": pair({ notes: [{ deg: 1, oct: 0, dur: 4 }] }) } } });
    song.arrangements.C.minLayout = "11";
    song.arrangements.D.minLayout = "11";
    expect(formProblems(song)).toEqual([]);
  });

  it("rejects a variant lyric that differs from the shared verse lyric", () => {
    const song = withVerseLines(valid, {
      verse: { "2": { "0": pair({ lyric: "Not the verse" }, { lyric: "Line A two" }) } },
    });
    const problems = formProblems(song);
    expect(problems.some((problem) => problem.field.endsWith("/C/lyric") && problem.error.includes("must equal"))).toBe(
      true,
    );
    expect(problems.some((problem) => problem.field.endsWith("/D/lyric"))).toBe(false);

    const blank = withVerseLines(valid, { verse: { "2": { "1": pair({ lyric: "" }, { lyric: "" }) } } });
    expect(formProblems(blank).some((problem) => problem.error.includes('verses["verse"][1][1]'))).toBe(true);
  });
});

function clonePlain(): Song {
  const song = load("valid.json");
  delete song.form;
  delete song.verses;
  for (const key of ["C", "D"] as const) {
    for (const line of song.arrangements[key].lines) delete line.section;
  }
  return song;
}
