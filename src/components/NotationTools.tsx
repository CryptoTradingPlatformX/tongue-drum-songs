import type { NoteSize } from "../lib/settings";

type Props = {
  noteSize: NoteSize;
  onNoteSize: (size: NoteSize) => void;
  followScroll: boolean;
  onFollowScroll: (value: boolean) => void;
  manualPlaying: boolean;
  onToggleManual: () => void;
  canScroll: boolean;
  speed: number;
  onSpeed: (speed: number) => void;
  linesPerMinute: number;
  bpm: number;
};

export function NotationTools({
  noteSize,
  onNoteSize,
  followScroll,
  onFollowScroll,
  manualPlaying,
  onToggleManual,
  canScroll,
  speed,
  onSpeed,
  linesPerMinute,
  bpm,
}: Props) {
  const rate = Number.isFinite(linesPerMinute) ? Math.round(linesPerMinute) : 0;
  return (
    <div className="notation-tools" data-scroll-controls data-sticky-chrome>
      <fieldset className="pills">
        <legend>Note size</legend>
        {(["compact", "large"] as const).map((size) => (
          <label key={size} className={noteSize === size ? "is-selected" : ""}>
            <input
              type="radio"
              name="note-size"
              value={size}
              checked={noteSize === size}
              onChange={() => onNoteSize(size)}
            />
            {size === "compact" ? "Compact" : "Large"}
          </label>
        ))}
      </fieldset>

      <label className={followScroll ? "fits-toggle is-on" : "fits-toggle"}>
        <input
          type="checkbox"
          checked={followScroll}
          onChange={(event) => onFollowScroll(event.target.checked)}
        />
        <span>Follow playback</span>
      </label>

      <div className="scroll-along">
        <button
          type="button"
          className={manualPlaying ? "scroll-play is-on" : "scroll-play"}
          aria-pressed={manualPlaying}
          disabled={!canScroll}
          onClick={onToggleManual}
        >
          {manualPlaying ? "Pause scroll" : "Scroll along"}
        </button>
        <label className="tempo">
          <span>
            Scroll speed <b>{speed.toFixed(2)}×</b>
            <span className="tempo-unit">
              {" "}
              · about {rate} {rate === 1 ? "line" : "lines"}/min at {bpm} BPM
            </span>
          </span>
          <input
            type="range"
            min={0.25}
            max={3}
            step={0.25}
            value={speed}
            aria-valuemin={0.25}
            aria-valuemax={3}
            aria-valuenow={speed}
            aria-valuetext={`${speed.toFixed(2)} times`}
            onChange={(event) => onSpeed(Number(event.target.value))}
          />
        </label>
      </div>
    </div>
  );
}
