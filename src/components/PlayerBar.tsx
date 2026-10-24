type Props = {
  index: number;
  total: number;
  playing: boolean;
  bpm: number;
  songBpm: number;
  onBpm: (bpm: number) => void;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
};

export function PlayerBar({ index, total, playing, bpm, songBpm, onBpm, onToggle, onPrev, onNext }: Props) {
  const atEnd = index >= total - 1 && index >= 0 && !playing;
  const position = index < 0 ? "Ready" : `Note ${index + 1} of ${total}`;

  return (
    <div className="player-dock">
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
      </div>
    </div>
  );
}
