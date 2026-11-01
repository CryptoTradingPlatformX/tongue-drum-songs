import schema from "../../schemas/song.schema.json";
import type { ErrorObject, ValidateFunction } from "ajv";
import {
  beatsPerBar,
  beatsWithin,
  formatBeats,
  layoutNotation,
  layoutProblems,
  measureBars,
  parseNote,
  totalBeats,
  type NoteEvent,
} from "./music";
import { formProblems } from "./songForm";
import type { LayoutId, Song } from "./types";

export type SongFailure = { file: string; field: string; error: string };

type ArrangementShape = {
  minLayout?: LayoutId;
  lines?: { lyric?: string; notes: unknown[] }[];
  unavailable?: { notes?: unknown };
};

type SongShape = {
  id?: string;
  timeSignature?: string;
  arrangements?: { C?: ArrangementShape; D?: ArrangementShape };
};

let validatorPromise: Promise<ValidateFunction> | null = null;

function getValidator(): Promise<ValidateFunction> {
  if (!validatorPromise) {
    validatorPromise = import("ajv/dist/2020").then(({ default: Ajv }) => {
      const ajv = new Ajv({ allErrors: true, strict: true });
      return ajv.compile(schema);
    });
  }
  return validatorPromise;
}

function pointer(error: ErrorObject): string {
  return error.instancePath || "/";
}

function isUnavailable(arrangement: ArrangementShape): boolean {
  return arrangement.unavailable != null && arrangement.lines == null;
}

/**
 * Schema plus the musical checks used for songs/*.json.
 * Pass `file` when the document lives on disk and its name must match the id.
 * Personal-song rules (my- prefix, license, attribution) are applied by the editor.
 */
export async function validateSongDocument(data: unknown, options?: { file?: string }): Promise<SongFailure[]> {
  const file = options?.file ?? "song";
  const validate = await getValidator();
  const failures: SongFailure[] = [];
  if (!validate(data)) {
    for (const error of validate.errors ?? []) {
      failures.push({
        file,
        field: pointer(error),
        error: error.message ?? "schema validation failed",
      });
    }
    return failures;
  }

  const song = data as SongShape;
  if (options?.file) {
    const base = options.file.split(/[/\\]/).pop() ?? options.file;
    if (base !== `${song.id}.json`) {
      failures.push({
        file,
        field: "/id",
        error: `id "${song.id}" must match filename ${song.id}.json`,
      });
    }
  }

  for (const drum of ["C", "D"] as const) {
    const arrangement = song.arrangements?.[drum];
    if (!arrangement || isUnavailable(arrangement)) continue;
    if (!arrangement.lines || !arrangement.minLayout) {
      failures.push({
        file,
        field: `/arrangements/${drum}`,
        error: "playable arrangements need minLayout and lines",
      });
      continue;
    }
    let parsedLines: { lyric?: string; notes: NoteEvent[] }[];
    try {
      parsedLines = arrangement.lines.map((line) => ({
        lyric: line.lyric,
        notes: line.notes.map((note) => parseNote(note)),
      }));
    } catch (error) {
      failures.push({
        file,
        field: `/arrangements/${drum}`,
        error: error instanceof Error ? error.message : "Could not parse notes",
      });
      continue;
    }
    const notes = parsedLines.flatMap((line) => line.notes);
    for (const problem of layoutProblems(notes, arrangement.minLayout)) {
      failures.push({
        file,
        field: `/arrangements/${drum}/minLayout`,
        error: problem,
      });
    }
    let laid;
    try {
      laid = layoutNotation(parsedLines, song.timeSignature ?? "");
    } catch (error) {
      failures.push({
        file,
        field: `/arrangements/${drum}`,
        error: error instanceof Error ? error.message : "Could not lay out notation",
      });
      continue;
    }
    const expected = beatsPerBar(song.timeSignature ?? "");
    for (const bar of measureBars(laid)) {
      if (bar.opened && bar.closed && !beatsWithin(bar.beats, expected)) {
        failures.push({
          file,
          field: `/arrangements/${drum}/lines`,
          error: `bar ${bar.number} totals ${formatBeats(bar.beats)} beats; expected ${formatBeats(expected)}`,
        });
      }
    }
    const raw = notes.reduce((sum, note) => sum + note.dur, 0);
    const rounded = totalBeats(notes);
    if (!beatsWithin(raw, rounded)) {
      failures.push({
        file,
        field: `/arrangements/${drum}`,
        error: `total ${raw} beats differs from rounded ${formatBeats(rounded)} by more than ${1e-6}`,
      });
    }
  }
  const left = song.arrangements?.C;
  const right = song.arrangements?.D;
  if (left?.lines && right?.lines && !isUnavailable(left) && !isUnavailable(right)) {
    for (const problem of formProblems(song as Song)) {
      failures.push({ file, field: problem.field, error: problem.error });
    }
  }
  return failures;
}
