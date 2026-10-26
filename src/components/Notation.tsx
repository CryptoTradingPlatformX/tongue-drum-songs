import type { DisplayBar, DisplayLine, DisplaySlice, NotationMark } from "../lib/music";
import { notationMark, tonguePhrase } from "../lib/music";
import type { DrumKey } from "../lib/types";

type Props = {
  lines: DisplayLine[];
  timeSignature: string;
  drumKey: DrumKey;
  activeLine: number;
  activeNote: number;
  markedLine: number;
  missing: Set<string>;
  onSelect: (lineIndex: number, noteIndex: number) => void;
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

export function Notation({ lines, timeSignature, drumKey, activeLine, activeNote, markedLine, missing, onSelect }: Props) {
  return (
    <div className={`notation meter-${timeSignature.replace("/", "")}`} aria-label={`Numbered notation in ${timeSignature}`}>
      <ol className="phrases">
        {lines.map((line, lineIndex) => (
          <li
            key={`${line.lyric ?? "phrase"}-${lineIndex}`}
            data-line={lineIndex}
            className={lineIndex === markedLine ? "phrase is-current" : "phrase"}
          >
            {line.lyric ? <p className="lyric">{line.lyric}</p> : null}
            <div className="bars">
              {lineIndex === 0 ? <span className="sig">{timeSignature}</span> : null}
              {line.bars.map((bar, barIndex) => (
                <div key={bar.number + "-" + barIndex} className="bar">
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
                                  <NoteButton
                                    key={`${slice.noteIndex}-${slice.beat}`}
                                    slice={slice}
                                    drumKey={drumKey}
                                    active={slice.lineIndex === activeLine && slice.noteIndex === activeNote}
                                    missing={noteMissing(slice, missing)}
                                    onSelect={onSelect}
                                  />
                                ))}
                              </span>
                            </span>
                          ) : (
                            <NoteButton
                              key={`${item.slices[0].noteIndex}-${item.slices[0].beat}`}
                              slice={item.slices[0]}
                              drumKey={drumKey}
                              active={item.slices[0].lineIndex === activeLine && item.slices[0].noteIndex === activeNote}
                              missing={noteMissing(item.slices[0], missing)}
                              onSelect={onSelect}
                            />
                          ),
                        )}
                      </div>
                    ))}
                  </div>
                  {barIndex === line.bars.length - 1 && bar.closedHere ? (
                    <span className="barline end" aria-hidden="true" />
                  ) : null}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function NoteButton({
  slice,
  drumKey,
  active,
  missing,
  onSelect,
}: {
  slice: DisplaySlice;
  drumKey: DrumKey;
  active: boolean;
  missing: boolean;
  onSelect: (lineIndex: number, noteIndex: number) => void;
}) {
  const mark: NotationMark = notationMark({
    rest: slice.note.rest,
    deg: slice.note.deg,
    oct: slice.note.oct,
    dur: slice.dur,
  });
  const name = slice.note.rest
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
        missing ? "is-missing" : "",
        slice.note.rest ? "is-rest" : "",
        slice.tie ? `tie-${slice.tie}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-current={active ? "true" : undefined}
      aria-label={`${name}, ${durationPhrase(slice.dur)}${tie}${gap}`}
      onClick={() => onSelect(slice.lineIndex, slice.noteIndex)}
    >
      <span className="glyph">
        <span className="degree">
          <span className="dots" aria-hidden="true">
            {Array.from({ length: mark.dotsAbove }, (_, index) => (
              <i key={index} />
            ))}
          </span>
          <span className="num">
            {mark.glyph}
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
