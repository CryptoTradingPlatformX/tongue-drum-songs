import { missingTongues, parseNote, quarterSeconds, tonguePhrase, totalBeats, type NoteEvent } from "./music";
import type { DrumKey, LayoutId, Song, SongLine, SongNote, VariantLine } from "./types";

export type FormFailure = { field: string; error: string };

export type ExpandedLine = {
  lyric?: string;
  notes: SongNote[];
  heading?: string;
  section?: string;
  verse?: number;
  verseTotal?: number;
};

const SECTION_SLUG = /^[a-z][a-z0-9-]*$/;

export function sectionHeading(section: string, verse?: number): string {
  if (verse != null) return `Verse ${verse}`;
  return section
    .split("-")
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function linesInSection(lines: SongLine[], section: string): SongLine[] {
  return lines.filter((line) => line.section === section);
}

function lyricText(lyric: string | undefined): string {
  return lyric ?? "";
}

export function expandArrangement(song: Song, key: DrumKey): ExpandedLine[] {
  const lines = song.arrangements[key].lines;
  if (!song.form) {
    return lines.map((line) => ({ lyric: line.lyric, notes: line.notes }));
  }
  const verseTotals = new Map<string, number>();
  for (const entry of song.form) {
    if (entry.verse != null) {
      verseTotals.set(entry.section, Math.max(verseTotals.get(entry.section) ?? 0, entry.verse));
    }
  }
  const expanded: ExpandedLine[] = [];
  for (const entry of song.form) {
    const sectionLines = linesInSection(lines, entry.section);
    const verseLyrics = entry.verse != null ? song.verses?.[entry.section]?.[entry.verse - 1] : undefined;
    sectionLines.forEach((line, index) => {
      const variant =
        entry.verse != null
          ? song.verseLines?.[entry.section]?.[String(entry.verse)]?.[String(index)]?.[key]
          : undefined;
      const raw =
        variant && variant.lyric !== undefined
          ? variant.lyric
          : verseLyrics
            ? verseLyrics[index]
            : line.lyric;
      expanded.push({
        lyric: raw && raw.length > 0 ? raw : undefined,
        notes: variant?.notes ?? line.notes,
        heading: index === 0 ? sectionHeading(entry.section, entry.verse) : undefined,
        section: entry.section,
        verse: entry.verse,
        verseTotal: entry.verse != null ? verseTotals.get(entry.section) : undefined,
      });
    });
  }
  return expanded;
}

export function verseIndicator(line: ExpandedLine | undefined): string | null {
  if (!line?.section) return null;
  if (line.verse != null && line.verseTotal != null) return `Verse ${line.verse} of ${line.verseTotal}`;
  return sectionHeading(line.section);
}

export function arrangementBeats(lines: { notes: { dur: number }[] }[]): number {
  return totalBeats(lines.flatMap((line) => line.notes));
}

/** Playback length in seconds. Beats are quarter notes and tempo is quarter-note BPM. */
export function playbackSeconds(beats: number, tempo: number): number {
  return quarterSeconds(beats, tempo);
}

export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const remain = total % 60;
  return `${minutes}:${remain.toString().padStart(2, "0")}`;
}

export function formProblems(song: Song): FormFailure[] {
  const failures: FormFailure[] = [];
  const form = song.form;
  const verses = song.verses;
  if (!form) {
    if (verses != null) {
      failures.push({ field: "/verses", error: "verses requires form" });
    }
    if (song.verseLines != null) {
      failures.push({ field: "/verseLines", error: "verseLines requires form" });
    }
    return failures;
  }

  const drums = ["C", "D"] as const;
  const sequences = drums.map((drum) => song.arrangements[drum].lines);
  if (sequences[0].length !== sequences[1].length) {
    failures.push({
      field: "/arrangements",
      error: "C and D must have the same number of lines when form is set",
    });
  }
  const lineCount = Math.min(sequences[0].length, sequences[1].length);
  for (let index = 0; index < lineCount; index += 1) {
    const left = sequences[0][index]?.section;
    const right = sequences[1][index]?.section;
    if (left !== right) {
      failures.push({
        field: `/arrangements/C/lines/${index}/section`,
        error: `C section "${left ?? ""}" must match D section "${right ?? ""}"`,
      });
    }
  }
  for (const drum of drums) {
    song.arrangements[drum].lines.forEach((line, index) => {
      if (!line.section) {
        failures.push({
          field: `/arrangements/${drum}/lines/${index}/section`,
          error: "every line needs a section when form is set",
        });
      } else if (!SECTION_SLUG.test(line.section)) {
        failures.push({
          field: `/arrangements/${drum}/lines/${index}/section`,
          error: `section "${line.section}" must match ${SECTION_SLUG}`,
        });
      }
    });
  }

  const sectionOrder = sequences[0].map((line) => line.section).filter((section): section is string => !!section);
  const known = new Set(sectionOrder);
  for (const entry of form) {
    if (!known.has(entry.section)) {
      failures.push({
        field: "/form",
        error: `form section "${entry.section}" is not on any line`,
      });
    }
  }
  for (const section of known) {
    if (!form.some((entry) => entry.section === section)) {
      failures.push({
        field: "/form",
        error: `section "${section}" never appears in form`,
      });
    }
  }

  const verseKeys = new Set(Object.keys(verses ?? {}));
  for (const section of verseKeys) {
    if (!known.has(section)) {
      failures.push({
        field: `/verses/${section}`,
        error: `verses key "${section}" is not a section on the lines`,
      });
    }
  }

  for (const section of known) {
    const sectionLines = linesInSection(sequences[0], section);
    const inVerses = verseKeys.has(section);
    const entries = form.filter((entry) => entry.section === section);
    if (inVerses) {
      const table = verses?.[section] ?? [];
      for (const entry of entries) {
        if (entry.verse == null) {
          failures.push({
            field: "/form",
            error: `section "${section}" is in verses, so each form entry needs verse`,
          });
          continue;
        }
        const row = table[entry.verse - 1];
        if (!row) {
          failures.push({
            field: `/verses/${section}`,
            error: `verse ${entry.verse} of "${section}" does not exist`,
          });
        } else if (row.length !== sectionLines.length) {
          failures.push({
            field: `/verses/${section}/${entry.verse - 1}`,
            error: `verse ${entry.verse} of "${section}" has ${row.length} lyrics; expected ${sectionLines.length}`,
          });
        }
      }
      const first = table[0];
      const own = sectionLines.map((line) => lyricText(line.lyric));
      if (!first) {
        failures.push({
          field: `/verses/${section}/0`,
          error: `verses.${section}[0] must match the lines' own lyrics`,
        });
      } else if (first.length !== own.length || first.some((lyric, index) => lyric !== own[index])) {
        failures.push({
          field: `/verses/${section}/0`,
          error: `verses.${section}[0] must equal the section lyrics ${JSON.stringify(own)}`,
        });
      }
    } else {
      for (const entry of entries) {
        if (entry.verse != null) {
          failures.push({
            field: "/form",
            error: `section "${section}" has no verses, so form entries must not set verse`,
          });
        }
      }
    }
  }
  failures.push(...verseLineProblems(song, known));
  return failures;
}

const VERSE_KEY = /^[1-9][0-9]*$/;
const LINE_KEY = /^(?:0|[1-9][0-9]*)$/;

function verseLineProblems(song: Song, known: Set<string>): FormFailure[] {
  const verseLines = song.verseLines;
  if (!verseLines) return [];
  const failures: FormFailure[] = [];
  const verses = song.verses;
  const drums = ["C", "D"] as const;
  for (const [section, byVerse] of Object.entries(verseLines)) {
    if (!known.has(section)) {
      failures.push({
        field: `/verseLines/${section}`,
        error: `verseLines section "${section}" is not a section on the lines`,
      });
      continue;
    }
    if (!verses || !Object.prototype.hasOwnProperty.call(verses, section)) {
      failures.push({
        field: `/verseLines/${section}`,
        error: `verseLines section "${section}" is not in verses`,
      });
      continue;
    }
    const table = verses[section] ?? [];
    const counts = drums.map((drum) => linesInSection(song.arrangements[drum].lines, section).length);
    const lineCount = Math.min(...counts);
    for (const [verseKey, byLine] of Object.entries(byVerse ?? {})) {
      if (!VERSE_KEY.test(verseKey) || !Number.isSafeInteger(Number(verseKey))) {
        failures.push({
          field: `/verseLines/${section}/${verseKey}`,
          error: `verseLines verse "${verseKey}" of "${section}" is not a verse number`,
        });
        continue;
      }
      const verseNumber = Number(verseKey);
      const row = table[verseNumber - 1];
      if (!row) {
        failures.push({
          field: `/verseLines/${section}/${verseKey}`,
          error: `verseLines verse ${verseNumber} of "${section}" does not exist`,
        });
        continue;
      }
      for (const [lineKey, pair] of Object.entries(byLine ?? {})) {
        if (!LINE_KEY.test(lineKey) || !Number.isSafeInteger(Number(lineKey))) {
          failures.push({
            field: `/verseLines/${section}/${verseKey}/${lineKey}`,
            error: `verseLines line "${lineKey}" of "${section}" is not a line index`,
          });
          continue;
        }
        const lineIndex = Number(lineKey);
        if (counts.some((count) => lineIndex >= count)) {
          failures.push({
            field: `/verseLines/${section}/${verseKey}/${lineKey}`,
            error: `verseLines line ${lineIndex} of "${section}" is outside that section's line count (${lineCount})`,
          });
          continue;
        }
        const record = pair as Partial<Record<DrumKey, VariantLine>> | undefined;
        if (!record?.C || !record?.D) {
          failures.push({
            field: `/verseLines/${section}/${verseKey}/${lineKey}`,
            error: `verseLines verse ${verseNumber} line ${lineIndex} of "${section}" needs both C and D`,
          });
        }
        for (const drum of drums) {
          const line = record?.[drum];
          if (!line) continue;
          const field = `/verseLines/${section}/${verseKey}/${lineKey}/${drum}`;
          failures.push(
            ...variantNoteProblems(line.notes, song.arrangements[drum].minLayout, drum, `${field}/notes`),
          );
          if (line.lyric !== undefined && line.lyric !== row[lineIndex]) {
            failures.push({
              field: `${field}/lyric`,
              error: `verseLines ${drum} lyric must equal verses["${section}"][${verseNumber - 1}][${lineIndex}]`,
            });
          }
        }
      }
    }
  }
  return failures;
}

function variantNoteProblems(
  notes: SongNote[] | undefined,
  minLayout: LayoutId,
  drum: DrumKey,
  field: string,
): FormFailure[] {
  if (!notes || notes.length === 0) {
    return [{ field, error: "verseLines notes are required" }];
  }
  let parsed: NoteEvent[];
  try {
    parsed = notes.map((note) => parseNote(note));
  } catch (error) {
    return [{ field, error: error instanceof Error ? error.message : "Could not parse notes" }];
  }
  const missing = missingTongues(parsed, minLayout);
  if (missing.length === 0) return [];
  const names = missing.map((tongue) => tonguePhrase(drum, tongue)).join(", ");
  return [{ field, error: `notes are not on the ${minLayout}-note layout: ${names}` }];
}
