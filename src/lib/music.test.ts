import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LayoutId, Song } from "./types";
import {
  LAYOUTS,
  arrangementFits,
  beatsPerBar,
  flattenLines,
  layoutById,
  layoutNotation,
  layoutPitchRange,
  layoutProblems,
  minimumLayout,
  missingTongues,
  notationMark,
  noteName,
  parseNote,
  pulseBeats,
  quarterSeconds,
  songNeedsBiggerLayout,
  tongueKey,
} from "./music";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const pitched = (deg: number, oct: number, dur = 1) => ({ rest: false, deg, oct, dur });

describe("parseNote", () => {
  it("parses a pitched scale degree", () => {
    expect(parseNote({ deg: 3, oct: 1, dur: 1.5 })).toEqual({
      rest: false,
      deg: 3,
      oct: 1,
      dur: 1.5,
    });
  });

  it("parses a rest", () => {
    expect(parseNote({ rest: true, dur: 1 })).toEqual({ rest: true, dur: 1 });
  });

  it("rejects degrees outside 1–7, bad octaves, and non-positive durations", () => {
    expect(() => parseNote({ deg: 8, oct: 0, dur: 1 })).toThrow(/deg/);
    expect(() => parseNote({ deg: 0, oct: 0, dur: 1 })).toThrow(/deg/);
    expect(() => parseNote({ deg: 1, dur: 1 })).toThrow(/oct/);
    expect(() => parseNote({ deg: 1, oct: 0, dur: 0 })).toThrow(/dur/);
    expect(() => parseNote({ rest: true, dur: -1 })).toThrow(/dur/);
    expect(() => parseNote(null)).toThrow(/object/);
  });
});

describe("note names", () => {
  it("names the C drum main octave C4–C5", () => {
    expect(["C4", "D4", "E4", "F4", "G4", "A4", "B4"]).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map((deg) => noteName("C", deg, 0)),
    );
    expect(noteName("C", 1, 1)).toBe("C5");
  });

  it("names the D drum main octave D4–D5 with F# and C#", () => {
    expect(["D4", "E4", "F#4", "G4", "A4", "B4", "C#5"]).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map((deg) => noteName("D", deg, 0)),
    );
    expect(noteName("D", 1, 1)).toBe("D5");
  });

  it("names the 15-note extremes", () => {
    expect(noteName("C", 3, -1)).toBe("E3");
    expect(noteName("C", 3, 1)).toBe("E5");
    expect(noteName("D", 3, -1)).toBe("F#3");
    expect(noteName("D", 3, 1)).toBe("F#5");
    expect(layoutPitchRange("8", "C")).toEqual({ low: "C4", high: "C5" });
    expect(layoutPitchRange("8", "D")).toEqual({ low: "D4", high: "D5" });
    expect(layoutPitchRange("15", "C")).toEqual({ low: "E3", high: "E5" });
    expect(layoutPitchRange("15", "D")).toEqual({ low: "F#3", high: "F#5" });
  });

  it("transposes the opening of Twinkle by scale degree", () => {
    const degrees = [1, 1, 5, 5, 6, 6, 5];
    expect(degrees.map((deg) => noteName("C", deg, 0))).toEqual(["C4", "C4", "G4", "G4", "A4", "A4", "G4"]);
    expect(degrees.map((deg) => noteName("D", deg, 0))).toEqual(["D4", "D4", "A4", "A4", "B4", "B4", "A4"]);
  });
});

describe("layouts", () => {
  const expected: Record<LayoutId, string[]> = {
    "8": ["1:0", "2:0", "3:0", "4:0", "5:0", "6:0", "7:0", "1:1"],
    "11": ["5:-1", "6:-1", "7:-1", "1:0", "2:0", "3:0", "4:0", "5:0", "6:0", "7:0", "1:1"],
    "13": ["5:-1", "6:-1", "7:-1", "1:0", "2:0", "3:0", "4:0", "5:0", "6:0", "7:0", "1:1", "2:1", "3:1"],
    "15": ["3:-1", "4:-1", "5:-1", "6:-1", "7:-1", "1:0", "2:0", "3:0", "4:0", "5:0", "6:0", "7:0", "1:1", "2:1", "3:1"],
  };

  it("matches the tongue sets, with 15 a superset of 13 and no high 4 or 5", () => {
    for (const layout of LAYOUTS) {
      expect(layout.tongues).toHaveLength(layout.noteCount);
      expect(layout.tongues.map(tongueKey).sort()).toEqual([...expected[layout.id]].sort());
    }
    const setOf = (id: LayoutId) => new Set(expected[id]);
    for (const key of setOf("13")) expect(setOf("15").has(key)).toBe(true);
    for (const key of setOf("11")) expect(setOf("13").has(key)).toBe(true);
    for (const key of setOf("8")) expect(setOf("11").has(key)).toBe(true);
    expect(setOf("15").has("4:1")).toBe(false);
    expect(setOf("15").has("5:1")).toBe(false);
    expect(setOf("13").has("3:-1")).toBe(false);
    expect(setOf("15").has("3:-1")).toBe(true);
    expect(setOf("15").has("4:-1")).toBe(true);
    expect(layoutById("11").typical && layoutById("13").typical && layoutById("15").typical).toBe(true);
    expect(layoutById("8").typical).toBe(false);
  });

  it("picks the smallest layout that can play the notes", () => {
    expect(minimumLayout([pitched(1, 0), pitched(1, 1)])).toBe("8");
    expect(minimumLayout([pitched(5, -1)])).toBe("11");
    expect(minimumLayout([pitched(6, -1), pitched(7, -1)])).toBe("11");
    expect(minimumLayout([pitched(2, 1)])).toBe("13");
    expect(minimumLayout([pitched(3, 1)])).toBe("13");
    expect(minimumLayout([pitched(3, -1)])).toBe("15");
    expect(minimumLayout([pitched(4, -1), pitched(2, 1)])).toBe("15");
    expect(minimumLayout([pitched(4, 1)])).toBeNull();
    expect(minimumLayout([pitched(5, 1)])).toBeNull();
    expect(minimumLayout([{ rest: true, dur: 2 }, pitched(3, 0)])).toBe("8");
  });

  it("flags a song that needs a bigger layout than the one selected", () => {
    const notes = [pitched(1, 0), pitched(5, -1), pitched(1, 1)];
    expect(arrangementFits(notes, "8")).toBe(false);
    expect(arrangementFits(notes, "11")).toBe(true);
    expect(songNeedsBiggerLayout("11", "8")).toBe(true);
    expect(songNeedsBiggerLayout("11", "13")).toBe(false);
    expect(missingTongues(notes, "8").map(tongueKey)).toEqual(["5:-1"]);
    expect(layoutProblems(notes, "8").join(" ")).toMatch(/not on the 8-note/);
    expect(layoutProblems(notes, "11")).toEqual([]);
    expect(layoutProblems([pitched(1, 0)], "11").join(" ")).toMatch(/smallest matching layout is "8"/);
  });
});

describe("notation marks", () => {
  it("draws octave dots, underlines, dashes, and the augmentation dot", () => {
    expect(notationMark(pitched(1, 1, 1))).toMatchObject({ glyph: "1", dotsAbove: 1, dotsBelow: 0, dashes: 0 });
    expect(notationMark(pitched(5, -1, 0.5))).toMatchObject({ glyph: "5", dotsBelow: 1, underlines: 1, dotted: false });
    expect(notationMark(pitched(3, 0, 0.25))).toMatchObject({ underlines: 2 });
    expect(notationMark(pitched(3, 0, 1))).toMatchObject({ dotted: false, dashes: 0, underlines: 0 });
    expect(notationMark(pitched(3, 0, 1.5))).toMatchObject({ dotted: true, dashes: 0, underlines: 0 });
    expect(notationMark(pitched(3, 0, 2))).toMatchObject({ dotted: false, dashes: 1 });
    expect(notationMark(pitched(3, 0, 3))).toMatchObject({ dotted: false, dashes: 2 });
    expect(notationMark(pitched(3, 0, 4))).toMatchObject({ dashes: 3 });
    expect(notationMark({ rest: true, dur: 1 })).toMatchObject({ glyph: "0", dotsAbove: 0, dotsBelow: 0 });
  });
});

describe("meters and playback timing", () => {
  it("counts 4/4, 3/4, 2/4, 2/2, and 6/8 in quarter-note beats", () => {
    expect(beatsPerBar("4/4")).toBe(4);
    expect(beatsPerBar("3/4")).toBe(3);
    expect(beatsPerBar("2/4")).toBe(2);
    expect(beatsPerBar("2/2")).toBe(4);
    expect(beatsPerBar("6/8")).toBe(3);
    expect(pulseBeats("6/8")).toBe(1.5);
    expect(pulseBeats("2/2")).toBe(2);
    expect(pulseBeats("4/4")).toBeNull();
    expect(pulseBeats("3/4")).toBeNull();
    expect(pulseBeats("2/4")).toBeNull();
    expect(() => beatsPerBar("5/4")).toThrow(/Unsupported/);
    expect(() => pulseBeats("7/8")).toThrow(/Unsupported/);
  });

  it("uses quarter-note BPM, so a 6/8 bar is three beats and a dotted quarter is 1.5", () => {
    expect(quarterSeconds(1, 60)).toBe(1);
    expect(quarterSeconds(3, 90)).toBeCloseTo(2);
    expect(quarterSeconds(1.5, 90)).toBeCloseTo(1);
    expect(quarterSeconds(0.5, 120)).toBeCloseTo(0.25);
    expect(() => quarterSeconds(1, 0)).toThrow(/bpm/);
  });

  it("groups 4/4 and 3/4 into bars with no inner pulse", () => {
    const four = layoutNotation(
      [{ notes: [pitched(1, 0), pitched(2, 0), pitched(3, 0), pitched(4, 0), pitched(5, 0, 2), pitched(5, 0, 2)] }],
      "4/4",
    );
    expect(four[0].bars).toHaveLength(2);
    expect(four[0].bars[0].slices.map((slice) => slice.dur)).toEqual([1, 1, 1, 1]);
    expect(four[0].bars.every((bar) => bar.slices.every((slice) => !slice.dividerBefore && slice.pulseMarks.length === 0))).toBe(true);

    const three = layoutNotation(
      [{ notes: [pitched(1, 0), pitched(2, 0, 2), pitched(3, 0, 0.5), pitched(4, 0, 0.5), pitched(5, 0, 2)] }],
      "3/4",
    );
    expect(three[0].bars).toHaveLength(2);
    expect(three[0].bars[0].beats).toBeCloseTo(3);
    expect(three[0].bars[1].beats).toBeCloseTo(3);
    expect(three[0].bars[1].slices.map((slice) => slice.note.deg)).toEqual([3, 4, 5]);
  });

  it("groups a 6/8 bar into two dotted-quarter pulses", () => {
    const eighths = Array.from({ length: 6 }, () => pitched(1, 0, 0.5));
    const [line] = layoutNotation([{ notes: eighths }], "6/8");
    expect(line.bars).toHaveLength(1);
    expect(line.bars[0].beats).toBeCloseTo(3);
    const divided = line.bars[0].slices.filter((slice) => slice.dividerBefore);
    expect(divided).toHaveLength(1);
    expect(divided[0].beat).toBeCloseTo(1.5);

    const row = layoutNotation(
      [{ notes: [pitched(1, 0, 1.5), pitched(1, 0, 1.5), pitched(1, 0, 1), pitched(2, 0, 0.5), pitched(3, 0, 1.5)] }],
      "6/8",
    );
    expect(row[0].bars).toHaveLength(2);
    expect(row[0].bars[0].slices.map((slice) => slice.dividerBefore)).toEqual([false, true]);
    expect(row[0].bars[1].slices.map((slice) => slice.dividerBefore)).toEqual([false, false, true]);
    expect(row[0].bars[1].slices[2].beat).toBeCloseTo(4.5);

    const held = layoutNotation([{ notes: [pitched(5, 0, 3)] }], "6/8");
    expect(held[0].bars[0].slices[0].pulseMarks).toEqual([0.5]);
    expect(held[0].bars[0].slices[0].dividerBefore).toBe(false);
  });

  it("groups 2/4 as two quarter-beats and 2/2 as two half-note pulses", () => {
    const twoFour = layoutNotation(
      [{ notes: [pitched(1, 0, 0.5), pitched(2, 0, 0.5), pitched(3, 0, 1), pitched(4, 0, 1), pitched(5, 0, 1)] }],
      "2/4",
    );
    expect(twoFour[0].bars).toHaveLength(2);
    expect(twoFour[0].bars[0].beats).toBeCloseTo(2);
    expect(twoFour[0].bars[1].beats).toBeCloseTo(2);
    expect(
      twoFour[0].bars.every((bar) => bar.slices.every((slice) => !slice.dividerBefore && slice.pulseMarks.length === 0)),
    ).toBe(true);

    const cut = layoutNotation(
      [{ notes: [pitched(1, 0, 1), pitched(1, 0, 1), pitched(2, 0, 2), pitched(3, 0, 4)] }],
      "2/2",
    );
    expect(cut[0].bars).toHaveLength(2);
    expect(cut[0].bars[0].beats).toBeCloseTo(4);
    expect(cut[0].bars[0].slices.map((slice) => slice.dividerBefore)).toEqual([false, false, true]);
    expect(cut[0].bars[1].slices[0].pulseMarks).toEqual([0.5]);
    expect(quarterSeconds(2, 60)).toBe(2);
  });

  it("ties a note that crosses a barline and continues a bar onto the next phrase", () => {
    const crossing = layoutNotation(
      [{ notes: [pitched(3, 0, 0.5), pitched(5, 0, 0.5), pitched(1, 1, 1), pitched(7, 0, 1.5)] }],
      "3/4",
    );
    expect(crossing[0].bars).toHaveLength(2);
    expect(crossing[0].bars[0].slices.at(-1)).toMatchObject({ tie: "start", dur: 1, noteIndex: 3 });
    expect(crossing[0].bars[1].slices[0]).toMatchObject({ tie: "stop", dur: 0.5, noteIndex: 3 });

    const lines = layoutNotation(
      [{ notes: [pitched(1, 0, 3)] }, { notes: [pitched(2, 0, 1)] }],
      "4/4",
    );
    expect(lines[0].bars[0]).toMatchObject({ number: 1, openedHere: true, closedHere: false });
    expect(lines[1].bars[0]).toMatchObject({ number: 1, openedHere: false, closedHere: true });
    const events = flattenLines([{ notes: [pitched(1, 0, 3)] }, { notes: [pitched(2, 0, 1)] }]);
    expect(events.map((event) => event.lineIndex)).toEqual([0, 1]);
    expect(quarterSeconds(events.reduce((sum, event) => sum + event.dur, 0), 60)).toBe(4);
  });
});

describe("sample songs", () => {
  const files = readdirSync(path.join(root, "songs")).filter((name) => name.endsWith(".json")).sort();

  it("loads every delivered song and keeps duration when grouping bars", () => {
    expect(files.length).toBe(50);
    const unsupported: string[] = [];
    for (const file of files) {
      const song = JSON.parse(readFileSync(path.join(root, "songs", file), "utf8")) as Song;
      expect(song.id + ".json").toBe(file);
      if (!["4/4", "3/4", "2/4", "2/2", "6/8"].includes(song.timeSignature)) {
        unsupported.push(`${file}: timeSignature ${song.timeSignature}`);
        continue;
      }
      for (const key of ["C", "D"] as const) {
        const arrangement = song.arrangements[key];
        const lines = arrangement.lines.map((line) => ({
          lyric: line.lyric,
          notes: line.notes.map((note) => parseNote(note)),
        }));
        expect(layoutProblems(lines.flatMap((line) => line.notes), arrangement.minLayout)).toEqual([]);
        const laid = layoutNotation(lines, song.timeSignature);
        const laidBeats = laid.reduce(
          (sum, line) => sum + line.bars.reduce((barSum, bar) => barSum + bar.beats, 0),
          0,
        );
        const rawBeats = lines.reduce(
          (sum, line) => sum + line.notes.reduce((noteSum, note) => noteSum + note.dur, 0),
          0,
        );
        expect(laidBeats).toBeCloseTo(rawBeats);
        for (const line of laid) {
          for (const bar of line.bars) {
            for (const slice of bar.slices) {
              expect(slice.dur).toBeGreaterThan(0);
              if (song.timeSignature === "6/8" || song.timeSignature === "2/2") continue;
              expect(slice.dividerBefore).toBe(false);
              expect(slice.pulseMarks).toEqual([]);
            }
          }
        }
      }
    }
    expect(unsupported).toEqual([]);
  });

  it("includes a 3/4 song and Row, Row, Row Your Boat in 6/8", () => {
    const songs = files.map(
      (file) => JSON.parse(readFileSync(path.join(root, "songs", file), "utf8")) as Song,
    );
    expect(songs.some((song) => song.timeSignature === "3/4")).toBe(true);
    const row = songs.find((song) => song.id === "row-row-row-your-boat");
    expect(row?.timeSignature).toBe("6/8");
    const lines = row!.arrangements.C.lines.map((line) => ({
      notes: line.notes.map((note) => parseNote(note)),
    }));
    const first = layoutNotation(lines, "6/8")[0];
    expect(first.bars[0].slices.some((slice) => slice.dividerBefore)).toBe(true);
    expect(minimumLayout(lines.flatMap((line) => line.notes))).toBe(row!.arrangements.C.minLayout);
  });

  it("groups a 2/2 song into half-note pulses and keeps lines that have no lyric", () => {
    const songs = files.map(
      (file) => JSON.parse(readFileSync(path.join(root, "songs", file), "utf8")) as Song,
    );
    const hundred = songs.find((song) => song.id === "old-hundredth");
    expect(hundred?.timeSignature).toBe("2/2");
    const lines = hundred!.arrangements.C.lines.map((line) => ({
      lyric: line.lyric,
      notes: line.notes.map((note) => parseNote(note)),
    }));
    const first = layoutNotation(lines, "2/2")[0];
    expect(first.bars[0].beats).toBeCloseTo(4);
    expect(first.bars[0].slices.some((slice) => slice.dividerBefore)).toBe(true);

    const instrumental = songs.filter((song) => song.arrangements.C.lines.every((line) => line.lyric == null));
    expect(instrumental.map((song) => song.id).sort()).toEqual([
      "minuet-in-g",
      "morning-mood",
      "pachelbel-canon",
      "surprise-symphony",
    ]);
    for (const song of instrumental) {
      const laid = layoutNotation(
        song.arrangements.C.lines.map((line) => ({
          notes: line.notes.map((note) => parseNote(note)),
        })),
        song.timeSignature,
      );
      expect(laid.every((line) => line.lyric == null)).toBe(true);
      expect(laid.some((line) => line.bars.length > 0)).toBe(true);
    }
  });

  it("uses each key's own notes and minLayout when C and D differ", () => {
    const load = (id: string) =>
      JSON.parse(readFileSync(path.join(root, "songs", `${id}.json`), "utf8")) as Song;
    const notesOf = (song: Song, key: "C" | "D") =>
      song.arrangements[key].lines.flatMap((line) => line.notes.map((note) => parseNote(note)));

    const yankee = load("yankee-doodle");
    expect(yankee.timeSignature).toBe("2/4");
    expect(yankee.arrangements.C.minLayout).toBe("11");
    expect(yankee.arrangements.D.minLayout).toBe("15");
    const yankeeC = notesOf(yankee, "C");
    const yankeeD = notesOf(yankee, "D");
    expect(yankeeC.map((note) => `${note.deg}:${note.oct}`).join(" ")).not.toBe(
      yankeeD.map((note) => `${note.deg}:${note.oct}`).join(" "),
    );
    const keepC = yankee.arrangements.C.lines.find((line) => line.lyric?.startsWith("Yankee Doodle, keep"));
    const keepD = yankee.arrangements.D.lines.find((line) => line.lyric?.startsWith("Yankee Doodle, keep"));
    expect(keepC?.notes[0]).toMatchObject({ deg: 6, oct: 0 });
    expect(keepD?.notes[0]).toMatchObject({ deg: 6, oct: -1 });
    expect(minimumLayout(yankeeC)).toBe("11");
    expect(minimumLayout(yankeeD)).toBe("15");
    expect(missingTongues(yankeeD, "11").some((tongue) => tongue.deg === 3 && tongue.oct === -1)).toBe(true);
    expect(missingTongues(yankeeC, "11")).toEqual([]);

    const canon = load("pachelbel-canon");
    expect(canon.arrangements.C.minLayout).toBe("11");
    expect(canon.arrangements.D.minLayout).toBe("13");
    expect(canon.arrangements.C.lines[0].lyric).toBeUndefined();
    expect(canon.arrangements.C.lines[0].notes[0]).toMatchObject({ deg: 3, oct: 0 });
    expect(canon.arrangements.D.lines[0].notes[0]).toMatchObject({ deg: 3, oct: 1 });
    expect(minimumLayout(notesOf(canon, "C"))).toBe("11");
    expect(minimumLayout(notesOf(canon, "D"))).toBe("13");
    expect(arrangementFits(notesOf(canon, "D"), "11")).toBe(false);
    expect(arrangementFits(notesOf(canon, "D"), "13")).toBe(true);
  });
});
