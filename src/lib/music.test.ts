import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { LayoutId, Song } from "./types";
import {
  LAYOUTS,
  arrangementFits,
  beatsPerBar,
  beatsWithin,
  flattenLines,
  formatBeats,
  layoutById,
  layoutNotation,
  layoutPitchRange,
  layoutProblems,
  measureBars,
  minimumLayout,
  missingTongues,
  notationMark,
  noteName,
  parseNote,
  meterHelp,
  pulseBeats,
  quarterSeconds,
  roundBeats,
  scheduleCursorMs,
  songNeedsBiggerLayout,
  tongueKey,
  totalBeats,
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
    expect(beatsPerBar("3/2")).toBe(6);
    expect(beatsPerBar("4/2")).toBe(8);
    expect(beatsPerBar("6/4")).toBe(6);
    expect(beatsPerBar("6/8")).toBe(3);
    expect(beatsPerBar("9/8")).toBe(4.5);
    expect(beatsPerBar("12/8")).toBe(6);
    expect(pulseBeats("6/4")).toBe(3);
    expect(pulseBeats("6/8")).toBe(1.5);
    expect(pulseBeats("9/8")).toBe(1.5);
    expect(pulseBeats("12/8")).toBe(1.5);
    expect(pulseBeats("2/2")).toBe(2);
    expect(pulseBeats("3/2")).toBe(2);
    expect(pulseBeats("4/2")).toBe(2);
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
    expect(quarterSeconds(4.5, 60)).toBeCloseTo(4.5);
    expect(quarterSeconds(6, 60)).toBe(6);
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

  it("groups 9/8 into three dotted-quarter pulses and 12/8 into four", () => {
    const nine = layoutNotation([{ notes: Array.from({ length: 9 }, () => pitched(1, 0, 0.5)) }], "9/8");
    expect(nine[0].bars).toHaveLength(1);
    expect(nine[0].bars[0].beats).toBeCloseTo(4.5);
    expect(nine[0].bars[0].openedHere).toBe(true);
    expect(nine[0].bars[0].closedHere).toBe(true);
    const nineDivided = nine[0].bars[0].slices.filter((slice) => slice.dividerBefore);
    expect(nineDivided.map((slice) => slice.beat)).toEqual([1.5, 3]);

    const twelve = layoutNotation([{ notes: Array.from({ length: 12 }, () => pitched(1, 0, 0.5)) }], "12/8");
    expect(twelve[0].bars).toHaveLength(1);
    expect(twelve[0].bars[0].beats).toBeCloseTo(6);
    expect(twelve[0].bars[0].slices.filter((slice) => slice.dividerBefore).map((slice) => slice.beat)).toEqual([
      1.5, 3, 4.5,
    ]);

    const heldNine = layoutNotation([{ notes: [pitched(5, 0, 4.5)] }], "9/8");
    expect(heldNine[0].bars[0].slices[0].pulseMarks[0]).toBeCloseTo(1 / 3);
    expect(heldNine[0].bars[0].slices[0].pulseMarks[1]).toBeCloseTo(2 / 3);
    const heldTwelve = layoutNotation([{ notes: [pitched(5, 0, 6)] }], "12/8");
    expect(heldTwelve[0].bars[0].slices[0].pulseMarks).toEqual([0.25, 0.5, 0.75]);

    const played = flattenLines([{ notes: Array.from({ length: 9 }, () => pitched(1, 0, 0.5)) }]);
    const seconds = played.reduce((sum, event) => sum + quarterSeconds(event.dur, 60), 0);
    expect(seconds).toBeCloseTo(4.5);
    const twelveSeconds = Array.from({ length: 12 }, () => 0.5).reduce((sum, dur) => sum + quarterSeconds(dur, 60), 0);
    expect(twelveSeconds).toBeCloseTo(6);
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

  it("groups 3/2 into three half-note pulses and 4/2 into four", () => {
    const three = layoutNotation(
      [{ notes: [pitched(1, 0, 2), pitched(2, 0, 2), pitched(3, 0, 2)] }],
      "3/2",
    );
    expect(three[0].bars).toHaveLength(1);
    expect(three[0].bars[0].beats).toBe(6);
    expect(three[0].bars[0].openedHere).toBe(true);
    expect(three[0].bars[0].closedHere).toBe(true);
    expect(three[0].bars[0].slices.filter((slice) => slice.dividerBefore).map((slice) => slice.beat)).toEqual([2, 4]);

    const four = layoutNotation(
      [{ notes: [pitched(1, 0, 2), pitched(2, 0, 2), pitched(3, 0, 2), pitched(4, 0, 2)] }],
      "4/2",
    );
    expect(four[0].bars[0].beats).toBe(8);
    expect(four[0].bars[0].slices.filter((slice) => slice.dividerBefore).map((slice) => slice.beat)).toEqual([2, 4, 6]);
    expect(meterHelp("3/2")).toMatch(/six quarter-beats/);
    expect(meterHelp("4/2")).toMatch(/eight quarter-beats/);
  });

  it("groups 6/4 into two dotted-half pulses", () => {
    const bar = layoutNotation(
      [{ notes: [pitched(1, 0, 1), pitched(2, 0, 2), pitched(3, 0, 3)] }],
      "6/4",
    );
    expect(bar[0].bars).toHaveLength(1);
    expect(bar[0].bars[0].beats).toBe(6);
    expect(bar[0].bars[0].openedHere).toBe(true);
    expect(bar[0].bars[0].closedHere).toBe(true);
    expect(bar[0].bars[0].slices.map((slice) => slice.dividerBefore)).toEqual([false, false, true]);
    expect(bar[0].bars[0].slices[2].beat).toBe(3);

    const held = layoutNotation([{ notes: [pitched(5, 0, 6)] }], "6/4");
    expect(held[0].bars[0].slices[0].pulseMarks).toEqual([0.5]);
    expect(held[0].bars[0].slices[0].dividerBefore).toBe(false);
    expect(meterHelp("6/4")).toMatch(/two dotted-half pulses/);
    expect(quarterSeconds(3, 60)).toBe(3);
    expect(quarterSeconds(6, 100)).toBeCloseTo(3.6);
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
    expect(files.length).toBe(109);
    const unsupported: string[] = [];
    for (const file of files) {
      const song = JSON.parse(readFileSync(path.join(root, "songs", file), "utf8")) as Song;
      expect(song.id + ".json").toBe(file);
      if (!["4/4", "3/4", "2/4", "2/2", "3/2", "4/2", "6/4", "6/8", "9/8", "12/8"].includes(song.timeSignature)) {
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
        expect(beatsWithin(laidBeats, rawBeats)).toBe(true);
        expect(formatBeats(laidBeats)).toBe(formatBeats(rawBeats));
        for (const line of laid) {
          for (const bar of line.bars) {
            for (const slice of bar.slices) {
              expect(slice.dur).toBeGreaterThan(0);
              if (
                song.timeSignature === "6/4" ||
                song.timeSignature === "6/8" ||
                song.timeSignature === "9/8" ||
                song.timeSignature === "12/8" ||
                song.timeSignature === "2/2" ||
                song.timeSignature === "3/2" ||
                song.timeSignature === "4/2"
              ) {
                continue;
              }
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
      "eine-kleine-nachtmusik",
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

  it("lays out Arirang and both Beautiful Dreamer arrangements in 9/8", () => {
    const load = (id: string) => JSON.parse(readFileSync(path.join(root, "songs", `${id}.json`), "utf8")) as Song;
    const dreamer = load("beautiful-dreamer");
    const arirang = load("arirang");
    expect(dreamer.timeSignature).toBe("9/8");
    expect(arirang.timeSignature).toBe("9/8");
    expect(dreamer.arrangements.C.minLayout).toBe("11");
    expect(dreamer.arrangements.D.minLayout).toBe("13");

    const wooC = dreamer.arrangements.C.lines.find((line) => line.lyric?.startsWith("List while I woo"));
    const wooD = dreamer.arrangements.D.lines.find((line) => line.lyric?.startsWith("List while I woo"));
    expect(wooC?.notes.map((note) => note.oct)).not.toEqual(wooD?.notes.map((note) => note.oct));

    for (const song of [dreamer, arirang]) {
      for (const key of ["C", "D"] as const) {
        const lines = song.arrangements[key].lines.map((line) => ({
          lyric: line.lyric,
          notes: line.notes.map((note) => parseNote(note)),
        }));
        const laid = layoutNotation(lines, song.timeSignature);
        expect(laid.length).toBe(lines.length);
        const fullBars = laid.flatMap((line) => line.bars).filter((bar) => bar.openedHere && bar.closedHere);
        expect(fullBars.length).toBeGreaterThan(0);
        expect(fullBars.every((bar) => Math.abs(bar.beats - 4.5) < 1e-6)).toBe(true);
        expect(fullBars.some((bar) => bar.slices.some((slice) => slice.dividerBefore))).toBe(true);
        const seconds = lines
          .flatMap((line) => line.notes)
          .reduce((sum, note) => sum + quarterSeconds(note.dur, song.tempo), 0);
        expect(seconds).toBeGreaterThan(0);
      }
    }

    const dreamerLine = layoutNotation(
      [
        {
          notes: dreamer.arrangements.D.lines[0].notes.map((note) => parseNote(note)),
        },
      ],
      "9/8",
    )[0];
    expect(dreamerLine.bars).toHaveLength(2);
    expect(dreamerLine.bars.every((bar) => Math.abs(bar.beats - 4.5) < 1e-6)).toBe(true);
    expect(quarterSeconds(9, dreamer.tempo)).toBeCloseTo(9);
  });
});

describe("triplets", () => {
  const third = 0.3333333333333333;

  it("groups three consecutive 1/3 notes into one quarter-beat", () => {
    const [line] = layoutNotation(
      [{ notes: [pitched(5, 0, third), pitched(6, 0, third), pitched(7, 0, third), pitched(1, 1, 1)] }],
      "4/4",
    );
    const slices = line.bars[0].slices;
    expect(slices.map((slice) => slice.triplet)).toEqual(["start", "mid", "end", null]);
    expect(roundBeats(slices[0].dur + slices[1].dur + slices[2].dur)).toBe(1);
    expect(slices[3].beat).toBe(1);
    expect(line.bars[0].beats).toBe(2);
    expect(notationMark(pitched(5, 0, third)).underlines).toBe(1);
  });

  it("rounds K-K-K-Katy to 63.5 and keeps every full bar on 4 beats", () => {
    const song = JSON.parse(readFileSync(path.join(root, "songs", "k-k-k-katy.json"), "utf8")) as Song;
    for (const key of ["C", "D"] as const) {
      const lines = song.arrangements[key].lines.map((line) => ({
        lyric: line.lyric,
        notes: line.notes.map((note) => parseNote(note)),
      }));
      const notes = lines.flatMap((line) => line.notes);
      const raw = notes.reduce((sum, note) => sum + note.dur, 0);
      expect(raw).toBe(63.50000000000004);
      expect(beatsWithin(raw, 63.5)).toBe(true);
      expect(formatBeats(raw)).toBe("63.5");
      expect(totalBeats(notes)).toBe(63.5);
      const laid = layoutNotation(lines, song.timeSignature);
      const roles = laid.flatMap((line) => line.bars.flatMap((bar) => bar.slices.map((slice) => slice.triplet)));
      expect(roles.filter((role) => role === "start").length).toBeGreaterThan(0);
      expect(roles.filter((role) => role === "start").length).toBe(roles.filter((role) => role === "end").length);
      for (const bar of measureBars(laid)) {
        if (bar.opened && bar.closed) expect(beatsWithin(bar.beats, 4)).toBe(true);
      }
    }
  });

  it("schedules triplet playback from one accumulated clock", () => {
    const three = scheduleCursorMs([third, third, third], 60);
    expect(three).toEqual([0, 333, 667, 1000]);
    const nine = scheduleCursorMs(Array.from({ length: 9 }, () => third), 60);
    expect(nine[0]).toBe(0);
    expect(nine[nine.length - 1]).toBe(3000);
    expect(scheduleCursorMs(Array.from({ length: 40 }, () => third), 100).at(-1)).toBe(8000);
  });

  it("lays out Just As I Am in 6/4 and the distinct C and D arrangements of The Old Oaken Bucket and The Water of Tyne", () => {
    const just = JSON.parse(readFileSync(path.join(root, "songs", "just-as-i-am.json"), "utf8")) as Song;
    expect(just.timeSignature).toBe("6/4");
    for (const key of ["C", "D"] as const) {
      const lines = just.arrangements[key].lines.map((line) => ({
        lyric: line.lyric,
        notes: line.notes.map((note) => parseNote(note)),
      }));
      expect(layoutProblems(lines.flatMap((line) => line.notes), just.arrangements[key].minLayout)).toEqual([]);
      const laid = layoutNotation(lines, "6/4");
      const bars = measureBars(laid);
      expect(bars.length).toBeGreaterThan(0);
      expect(bars.every((bar) => bar.opened && bar.closed && beatsWithin(bar.beats, 6))).toBe(true);
      expect(laid.some((line) => line.bars.some((bar) => bar.slices.some((slice) => slice.dividerBefore)))).toBe(true);
    }

    for (const id of ["the-old-oaken-bucket", "the-water-of-tyne"]) {
      const song = JSON.parse(readFileSync(path.join(root, "songs", `${id}.json`), "utf8")) as Song;
      const fingerprint = (key: "C" | "D") =>
        song.arrangements[key].lines
          .map((line) => line.notes.map((note) => `${note.rest ? "r" : note.deg + ":" + note.oct}/${note.dur}`).join(" "))
          .join("|");
      expect(fingerprint("C")).not.toBe(fingerprint("D"));
      for (const key of ["C", "D"] as const) {
        const lines = song.arrangements[key].lines.map((line) => ({
          lyric: line.lyric,
          notes: line.notes.map((note) => parseNote(note)),
        }));
        expect(layoutProblems(lines.flatMap((line) => line.notes), song.arrangements[key].minLayout)).toEqual([]);
        const laid = layoutNotation(lines, song.timeSignature);
        expect(laid.some((line) => line.bars.some((bar) => bar.slices.length > 0))).toBe(true);
        for (const bar of measureBars(laid)) {
          if (bar.opened && bar.closed) expect(beatsWithin(bar.beats, beatsPerBar(song.timeSignature))).toBe(true);
        }
      }
    }
  });

  it("lays out distinct C and D arrangements for Lorelei, Grandfather's Clock, and Blessed Assurance", () => {
    for (const id of ["die-lorelei", "grandfathers-clock", "blessed-assurance"]) {
      const song = JSON.parse(readFileSync(path.join(root, "songs", `${id}.json`), "utf8")) as Song;
      const fingerprint = (key: "C" | "D") =>
        song.arrangements[key].lines.map((line) => line.notes.map((note) => `${note.rest ? "r" : note.deg + ":" + note.oct}/${note.dur}`).join(" ")).join("|");
      expect(fingerprint("C")).not.toBe(fingerprint("D"));
      for (const key of ["C", "D"] as const) {
        const lines = song.arrangements[key].lines.map((line) => ({
          lyric: line.lyric,
          notes: line.notes.map((note) => parseNote(note)),
        }));
        expect(layoutProblems(lines.flatMap((line) => line.notes), song.arrangements[key].minLayout)).toEqual([]);
        const laid = layoutNotation(lines, song.timeSignature);
        expect(laid.some((line) => line.bars.some((bar) => bar.slices.length > 0))).toBe(true);
        const expected = beatsPerBar(song.timeSignature);
        for (const bar of measureBars(laid)) {
          if (bar.opened && bar.closed) expect(beatsWithin(bar.beats, expected)).toBe(true);
        }
      }
    }
  });
});
