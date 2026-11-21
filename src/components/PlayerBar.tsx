type Props = {
  index: number;
  total: number;
  playing: boolean;
  bpm: number;
  songBpm: number;
  verseLabel?: string | null;
  onBpm: (bpm: number) => void;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onPlayFrom?: () => void;
  loop?: boolean;
  onLoop?: (value: boolean) => void;
  metronome?: boolean;
  onMetronome?: (value: boolean) => void;
};

export function PlayerBar({
  index,
  total,
  playing,
  bpm,
  songBpm,
  verseLabel,
  onBpm,
  onToggle,
  onPrev,
  onNext,
  onPlayFrom,
  loop = false,
  onLoop,
  metronome = false,
  onMetronome,
}: Props) {
  const atEnd = index >= total - 1 && index >= 0 && !playing;
  const position = index < 0 ? "Ready" : `Note ${index + 1} of ${total}`;

  return (
    <div className="player-dock" data-sticky-chrome>
      {verseLabel ? (
        <p className="verse-indicator" aria-live="polite">
          {verseLabel}
        </p>
      ) : null}
      <div className="player" role="group" aria-label="Practice">
        <div className="transport">
          <button type="button" onClick={onPrev} disabled={total === 0}>
            Previous
          </button>
          <button type="button" className="play" onClick={onToggle} aria-pressed={playing} disabled={total === 0}>
            {playing ? "Pause" : atEnd ? "Play again" : "Play"}
          </button>
          <button type="button" onClick={onNext} disabled={total === 0}>
            Next
          </button>
        </div>
        <p className="position">{position}</p>
        <label className="tempo">
          <span>
            Tempo <strong>{Math.round(bpm)}</strong>
            <span className="tempo-unit"> quarter BPM</span>
          </span>
          <input
            type="range"
            min={40}
            max={200}
            step={1}
            value={bpm}
            aria-valuetext={`${Math.round(bpm)} quarter notes per minute`}
            onChange={(event) => onBpm(Number(event.target.value))}
          />
          {Math.round(bpm) !== songBpm ? (
            <button type="button" className="text-button" onClick={() => onBpm(songBpm)}>
              Song tempo ({songBpm})
            </button>
          ) : null}
        </label>
        {onPlayFrom || onLoop || onMetronome ? (
          <div className="player-extras">
            {onPlayFrom ? (
              <button type="button" onClick={onPlayFrom} disabled={total === 0}>
                Play from here
              </button>
            ) : null}
            {onLoop ? (
              <label className="count-in">
                <input type="checkbox" checked={loop} onChange={(event) => onLoop(event.target.checked)} />
                Loop
              </label>
            ) : null}
            {onMetronome ? (
              <label className="count-in">
                <input type="checkbox" checked={metronome} onChange={(event) => onMetronome(event.target.checked)} />
                Metronome
              </label>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
