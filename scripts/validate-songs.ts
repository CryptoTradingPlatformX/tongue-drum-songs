import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateSongDocument, type SongFailure } from "../src/lib/validateSong.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const songsDir = path.join(root, "songs");

const files = readdirSync(songsDir)
  .filter((name) => name.endsWith(".json"))
  .sort();

if (files.length === 0) {
  console.error("No songs found in songs/");
  process.exit(1);
}

const failures: SongFailure[] = [];
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
  failures.push(...(await validateSongDocument(data, { file })));
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
