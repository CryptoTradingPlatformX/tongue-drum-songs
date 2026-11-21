import type { DisplayBar, DisplayLine, DisplaySlice, NotationMark } from "../lib/music";
import { beatsPerBar, notationMark, tonguePhrase } from "../lib/music";
import type { DrumKey } from "../lib/types";

type Props = {
  lines: DisplayLine[];
  timeSignature: string;
  drumKey: DrumKey;
  activeLine: number;
  activeNote: number;
  pickedLine?: number;
  pickedNote?: number;
  caretLine?: number;
  caretIndex?: number;
  rangeStart?: { line: number; note: number } | null;
  rangeEnd?: { line: number; note: number } | null;
  lyrics?: string[];
  onLyric?: (lineIndex: number, lyric: string) => void;
  showBarFill?: boolean;
  uncertain?: Set<string>;
  markedLine: number;
  missing: Set<string>;
  onSelect: (lineIndex: number, noteIndex: number, shiftKey: boolean) => void;
};

function durationPhrase(dur: number): string {
  const rounded = Math.round(dur * 1000) / 1000;
  const known: Record<string, string> = {
    "0.25": "sixteenth note",
    "0.333": "triplet eighth note",
    "0.5": "eighth note",
    "0.75": "dotted eighth note",
    "1": "quarter note",
    "1.5": "dotted quarter note",
    "2": "half note",
    "3": "three beats",
    "4": "whole note",
  };
  return known[String(rounded)] ?? `${rounded} beats`;
}

function clusters(bar: DisplayBar): Array<{ key: string; span: boolean; slices: DisplaySlice[] }> {
  const groups: Array<{ key: string; span: boolean; slices: DisplaySlice[] }> = [];
  let current: DisplaySlice[] = [];
  const flush = () => {
    if (!current.length) return;
    groups.push({ key: `p-${current[0].beat}`, span: false, slices: current });
    current = [];
  };
  for (const slice of bar.slices) {
    const insideTriplet = slice.triplet === "mid" || slice.triplet === "end";
    if (!insideTriplet && slice.pulseMarks.length > 0) {
      flush();
      groups.push({ key: `s-${slice.beat}`, span: true, slices: [slice] });
      continue;
    }
    if (!insideTriplet && slice.dividerBefore) flush();
    current.push(slice);
  }
  flush();
  return groups;
}

function noteMissing(slice: DisplaySlice, missing: Set<string>): boolean {
  return (
    !slice.note.rest &&
    slice.note.deg != null &&
    slice.note.oct != null &&
    missing.has(`${slice.note.deg}:${slice.note.oct}`)
  );
}

function sliceGroups(slices: DisplaySlice[]): Array<{ kind: "triplet" | "note"; slices: DisplaySlice[] }> {
  const groups: Array<{ kind: "triplet" | "note"; slices: DisplaySlice[] }> = [];
  for (let index = 0; index < slices.length; ) {
    const slice = slices[index];
    const middle = slices[index + 1];
    const end = slices[index + 2];
    if (slice.triplet === "start" && middle?.triplet === "mid" && end?.triplet === "end") {
      groups.push({ kind: "triplet", slices: [slice, middle, end] });
      index += 3;
    } else {
      groups.push({ kind: "note", slices: [slice] });
      index += 1;
    }
  }
  return groups;
}

function lastNoteIndex(line: DisplayLine): number {
  let max = -1;
  for (const bar of line.bars) {
    for (const slice of bar.slices) max = Math.max(max, slice.noteIndex);
  }
  return max;
}

export function Notation({
  lines,
  timeSignature,
  drumKey,
  activeLine,
  activeNote,
  pickedLine = -1,
  pickedNote = -1,
  uncertain,
  markedLine,
  missing,
  caretLine = -1,
  caretIndex = -1,
  rangeStart = null,
  rangeEnd = null,
  lyrics,
  onLyric,
  showBarFill = false,
  onSelect,
}: Props) {
  const perBar = beatsPerBar(timeSignature);
  const inRange = (line: number, note: number) => {
    if (!rangeStart || !rangeEnd) return false;
    const start = rangeStart.line < rangeEnd.line || (rangeStart.line === rangeEnd.line && rangeStart.note <= rangeEnd.note) ? rangeStart : rangeEnd;
    const end = start === rangeStart ? rangeEnd : rangeStart;
    if (line < start.line || line > end.line) return false;
    if (line === start.line && note < start.note) return false;
    if (line === end.line && note > end.note) return false;
    return true;
  };
  return (
    <div className={`notation meter-${timeSignature.replace("/", "")}`} aria-label={`Numbered notation in ${timeSignature}`}>
      <ol className="phrases">
        {lines.map((line, lineIndex) => (
          <li
            key={`${line.lyric ?? "phrase"}-${lineIndex}`}
            data-line={lineIndex}
            className={lineIndex === markedLine ? "phrase is-current" : "phrase"}
          >
            {line.heading ? <p className="section-heading">{line.heading}</p> : null}
            {lyrics && onLyric ? (
              <input
                className="lyric-inline"
                aria-label={`Lyric for line ${lineIndex + 1}`}
                placeholder="Lyric"
                value={lyrics[lineIndex] ?? ""}
                onChange={(event) => onLyric(lineIndex, event.target.value)}
              />
            ) : line.lyric ? (
              <p className="lyric">{line.lyric}</p>
            ) : null}
            <div className="bars">
              {lineIndex === 0 ? <span className="sig">{timeSignature}</span> : null}
              {line.bars.map((bar, barIndex) => {
                const fill = !showBarFill ? "" : bar.beats > perBar + 0.05 ? " is-over" : bar.beats + 0.05 < perBar ? " is-short" : " is-complete";
                return (
                <div key={bar.number + "-" + barIndex} className={`bar${fill}`}>
                  {bar.openedHere ? (
                    <span className="barline" aria-hidden="true">
                      <span className="bar-no">{bar.number}</span>
                    </span>
                  ) : null}
                  <div className="clusters">
                    {clusters(bar).map((group) => (
                      <div key={group.key} className={group.span ? "cluster is-span" : "cluster"}>
                        {sliceGroups(group.slices).map((item) =>
                          item.kind === "triplet" ? (
                            <span key={`triplet-${item.slices[0].beat}`} className="triplet">
                              <span className="triplet-mark" aria-hidden="true">
                                3
                              </span>
                              <span className="triplet-notes">
                                {item.slices.map((slice) => (
                                  <>
                                  {caretLine === slice.lineIndex && caretIndex === slice.noteIndex ? (
                                    <span className="insert-caret" aria-hidden="true" />
                                  ) : null}
                                  <NoteButton
                                    key={`${slice.noteIndex}-${slice.beat}`}
                                    slice={slice}
                                    drumKey={drumKey}
                                    active={slice.lineIndex === activeLine && slice.noteIndex === activeNote}
                                    picked={slice.lineIndex === pickedLine && slice.noteIndex === pickedNote}
                                    uncertain={uncertain?.has(`${slice.lineIndex}:${slice.noteIndex}`) ?? false}
                                    missing={noteMissing(slice, missing)}
                                    onSelect={onSelect}
                                  />
                                  </>
                                ))}
                              </span>
                            </span>
                          ) : (
                            <>
                              {caretLine === item.slices[0].lineIndex && caretIndex === item.slices[0].noteIndex ? (
                                <span className="insert-caret" aria-hidden="true" />
                              ) : null}
                            <NoteButton
                              key={`${item.slices[0].noteIndex}-${item.slices[0].beat}`}
                              slice={item.slices[0]}
                              drumKey={drumKey}
                              active={item.slices[0].lineIndex === activeLine && item.slices[0].noteIndex === activeNote}
                              picked={item.slices[0].lineIndex === pickedLine && item.slices[0].noteIndex === pickedNote}
                              ranged={inRange(item.slices[0].lineIndex, item.slices[0].noteIndex)}
                              uncertain={uncertain?.has(`${item.slices[0].lineIndex}:${item.slices[0].noteIndex}`) ?? false}
                              missing={noteMissing(item.slices[0], missing)}
                              onSelect={onSelect}
                            />
                            </>
                          ),
                        )}
                      </div>
                    ))}
                  </div>
                  {barIndex === line.bars.length - 1 && bar.closedHere ? (
                    <span className="barline end" aria-hidden="true" />
                  ) : null}
                  {barIndex === line.bars.length - 1 && caretLine === lineIndex && caretIndex > lastNoteIndex(line) ? (
                    <span className="insert-caret" aria-hidden="true" />
                  ) : null}
                </div>
                );
              })}
              {line.bars.length === 0 && caretLine === lineIndex ? <span className="insert-caret" aria-hidden="true" /> : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function DegreeMark({ deg, oct }: { deg: number; oct: number }) {
  const mark: NotationMark = notationMark({ rest: false, deg, oct, dur: 1 });
  return (
    <span className="glyph">
      <span className="degree">
        <span className="dots" aria-hidden="true">
          {Array.from({ length: mark.dotsAbove }, (_, index) => (
            <i key={index} />
          ))}
        </span>
        <span className="num">{mark.glyph}</span>
        <span className="dots below" aria-hidden="true">
          {Array.from({ length: mark.dotsBelow }, (_, index) => (
            <i key={index} />
          ))}
        </span>
        <span className="underlines spacer" aria-hidden="true" />
      </span>
    </span>
  );
}

function NoteButton({
  slice,
  drumKey,
  active,
  picked,
  ranged = false,
  uncertain = false,
  missing,
  onSelect,
}: {
  slice: DisplaySlice;
  drumKey: DrumKey;
  active: boolean;
  picked: boolean;
  ranged?: boolean;
  uncertain?: boolean;
  missing: boolean;
  onSelect: (lineIndex: number, noteIndex: number, shiftKey: boolean) => void;
}) {
  const mark: NotationMark = notationMark({
    rest: slice.note.rest,
    deg: slice.note.deg,
    oct: slice.note.oct,
    dur: slice.dur,
  });
  const name = uncertain
    ? "Unrecognized note"
    : slice.note.rest
      ? "Rest"
      : tonguePhrase(drumKey, { deg: slice.note.deg ?? 1, oct: slice.note.oct ?? 0 });
  const tie = slice.tie ? ", tied across the barline" : "";
  const gap = missing ? ", not on the selected drum" : "";

  return (
    <button
      type="button"
      className={[
        "note",
        active ? "is-active" : "",
        picked && !active ? "is-picked" : "",
        ranged ? "is-range" : "",
        uncertain ? "is-uncertain" : "",
        missing ? "is-missing" : "",
        slice.note.rest ? "is-rest" : "",
        slice.tie ? `tie-${slice.tie}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-current={active ? "true" : undefined}
      aria-label={`${name}, ${durationPhrase(slice.dur)}${tie}${gap}`}
      onClick={(event) => onSelect(slice.lineIndex, slice.noteIndex, event.shiftKey)}
      onPointerDown={(event) => {
        const button = event.currentTarget;
        const timer = window.setTimeout(() => onSelect(slice.lineIndex, slice.noteIndex, true), 480);
        const clear = () => window.clearTimeout(timer);
        button.addEventListener("pointerup", clear, { once: true });
        button.addEventListener("pointercancel", clear, { once: true });
        button.addEventListener("pointerleave", clear, { once: true });
      }}
    >
      <span className="glyph">
        <span className="degree">
          <span className="dots" aria-hidden="true">
            {Array.from({ length: mark.dotsAbove }, (_, index) => (
              <i key={index} />
            ))}
          </span>
          <span className="num">
            {uncertain ? "?" : mark.glyph}
            {mark.dotted ? <span className="aug">·</span> : null}
          </span>
          <span className="dots below" aria-hidden="true">
            {Array.from({ length: mark.dotsBelow }, (_, index) => (
              <i key={index} />
            ))}
          </span>
          {mark.underlines > 0 ? (
            <span className="underlines" aria-hidden="true">
              {Array.from({ length: mark.underlines }, (_, index) => (
                <i key={index} />
              ))}
            </span>
          ) : (
            <span className="underlines spacer" aria-hidden="true" />
          )}
        </span>
        {mark.dashes > 0
          ? Array.from({ length: mark.dashes }, (_, index) => (
              <span key={index} className="dash" aria-hidden="true">
                –
              </span>
            ))
          : null}
      </span>
      {slice.pulseMarks.map((markPosition) => (
        <span
          key={markPosition}
          className="pulse-mark"
          style={{ left: `${markPosition * 100}%` }}
          aria-hidden="true"
        />
      ))}
    </button>
  );
}
