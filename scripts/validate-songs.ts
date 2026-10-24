import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv, { type ErrorObject } from "ajv/dist/2020";
import { layoutProblems, parseNote, type NoteEvent } from "../src/lib/music.ts";
import type { LayoutId, Song } from "../src/lib/types.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(readFileSync(path.join(root, "schemas/song.schema.json"), "utf8")) as object;
const songsDir = path.join(root, "songs");

const ajv = new Ajv({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

type Failure = { file: string; field: string; error: string };

function pointer(error: ErrorObject): string {
  return error.instancePath || "/";
}

function checkSong(file: string, data: unknown): Failure[] {
  const failures: Failure[] = [];
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

  const song = data as Song;
  const base = path.basename(file);
  if (base !== `${song.id}.json`) {
    failures.push({
      file,
      field: "/id",
      error: `id "${song.id}" must match filename ${song.id}.json`,
    });
  }

  for (const drum of ["C", "D"] as const) {
    const arrangement = song.arrangements[drum];
    let notes: NoteEvent[];
    try {
      notes = arrangement.lines.flatMap((line) => line.notes.map((note) => parseNote(note)));
    } catch (error) {
      failures.push({
        file,
        field: `/arrangements/${drum}`,
        error: error instanceof Error ? error.message : "Could not parse notes",
      });
      continue;
    }
    for (const problem of layoutProblems(notes, arrangement.minLayout as LayoutId)) {
      failures.push({
        file,
        field: `/arrangements/${drum}/minLayout`,
        error: problem,
      });
    }
  }
  return failures;
}

const files = readdirSync(songsDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

if (files.length === 0) {
  console.error("No songs found in songs/");
  process.exit(1);
}

const failures: Failure[] = [];
const seen = new Set<string>();
for (const name of files) {
  const file = path.join("songs", name);
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(path.join(songsDir, name), "utf8"));
  } catch (error) {
    failures.push({
      file,
      field: "/",
      error: error instanceof Error ? error.message : "Invalid JSON",
    });
    continue;
  }
  const id = data && typeof data === "object" && "id" in data ? String((data as { id: unknown }).id) : "";
  if (id && seen.has(id)) {
    failures.push({ file, field: "/id", error: `duplicate id "${id}"` });
  }
  if (id) seen.add(id);
  failures.push(...checkSong(file, data));
}

if (failures.length > 0) {
  console.error(`Song validation failed (${failures.length} problem${failures.length === 1 ? "" : "s"}):\n`);
  for (const failure of failures) {
    console.error(`file: ${failure.file}`);
    console.error(`field: ${failure.field}`);
    console.error(`error: ${failure.error}\n`);
  }
  process.exit(1);
}

console.log(`Validated ${files.length} song${files.length === 1 ? "" : "s"} in songs/`);
