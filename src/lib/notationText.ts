import { DRUM_LAYOUT } from "./arrangements";
import { beatsPerBar, noteFitsLayout } from "./music";
import type { EditorLine, EditorNote } from "./editor";
import type { DrumKey, TimeSignature } from "./types";

export type TextIssue = { index: number; length: number; message: string };

const TOKEN = /^([0-7])('+|,+)?(_|=)?(-*)(\.)?/;

function durationOf(halves: boolean, sixteenths: boolean, dashes: string, dotted: boolean): number {
  let dur = sixteenths ? 0.25 : halves ? 0.5 : 1;
  dur += dashes.length;
  if (dotted) dur *= 1.5;
  return dur;
}

function octaveOf(mark: string | undefined): number {
  if (!mark) return 0;
  if (mark.includes("'")) return 1;
  if (mark.includes(",")) return -1;
  return 0;
}

export function parseNotationText(
  text: string,
  drum: DrumKey,
): { lines: EditorLine[]; warnings: TextIssue[] } | { error: TextIssue } {
  const lines: EditorLine[] = [];
  const warnings: TextIssue[] = [];
  const rows = text.split(/\n/);
  let offset = 0;
  for (const row of rows) {
    const notes: EditorNote[] = [];
    let cursor = 0;
    while (cursor < row.length) {
      const char = row[cursor];
      if (char === " " || char === "\t" || char === "|") {
        cursor += 1;
        continue;
      }
      const slice = row.slice(cursor);
      const match = TOKEN.exec(slice);
      if (!match) {
        return {
          error: {
            index: offset + cursor,
            length: 1,
            message: `"${char}" is not a note. Use a degree from 1 to 7, or 0 for a rest.`,
          },
        };
      }
      const [token, degree, octaveMark, lengthMark, dashes, dot] = match;
      const oct = octaveOf(octaveMark);
      const dur = durationOf(lengthMark === "_", lengthMark === "=", dashes ?? "", dot === ".");
      const deg = Number(degree);
      if (deg === 0) notes.push({ rest: true, dur });
      else {
        notes.push({ deg, oct, dur });
        if (!noteFitsLayout(deg, oct, DRUM_LAYOUT[drum])) {
          warnings.push({
            index: offset + cursor,
            length: token.length,
            message: `${deg}${oct < 0 ? "," : oct > 0 ? "'" : ""} is not on the ${DRUM_LAYOUT[drum]}-note ${drum} drum`,
          });
        }
      }
      cursor += token.length;
    }
    lines.push({ lyric: "", notes });
    offset += row.length + 1;
  }
  const kept = lines.filter((line, index) => line.notes.length > 0 || index === lines.length - 1 || lines.length === 1);
  return { lines: kept.length > 0 ? kept : [{ lyric: "", notes: [] }], warnings };
}

function tokenFor(note: EditorNote): string {
  const degree = note.rest ? "0" : String(note.deg ?? 1);
  const oct = note.rest ? "" : note.oct === 1 ? "'" : note.oct === -1 ? "," : "";
  let dur = note.dur;
  let dotted = false;
  const doubled = dur / 1.5;
  if (Math.abs(doubled * 2 - Math.round(doubled * 2)) < 1e-6 && Math.abs(dur - doubled) > 1e-6) {
    dotted = true;
    dur = doubled;
  }
  let body = "";
  const quarters = Math.round(dur * 4) / 4;
  if (Math.abs(quarters - 0.25) < 1e-6) body = "=";
  else if (Math.abs(quarters - 0.5) < 1e-6) body = "_";
  else {
    const beats = Math.max(0, Math.round(quarters) - 1);
    body = "-".repeat(beats);
    if (Math.abs(quarters - (1 + beats)) > 1e-6) body = `_${"-".repeat(Math.max(0, Math.round(quarters / 0.5) - 1))}`;
  }
  return `${degree}${oct}${body}${dotted ? "." : ""}`;
}

export function serializeNotation(lines: EditorLine[], meter: TimeSignature): string {
  const per = beatsPerBar(meter);
  return lines
    .map((line) => {
      const parts: string[] = [];
      let beats = 0;
      line.notes.forEach((note, index) => {
        if (index > 0 && beats > 1e-6 && Math.abs(beats % per) < 1e-6) parts.push("|");
        parts.push(tokenFor(note));
        beats += note.dur;
      });
      return parts.join(" ");
    })
    .join("\n");
}
