import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { CHORD_LAYOUT, CHORDS, chordLabel, type Chord, type ChordVoicing } from "../data/chords";
import { unlockAudio, playTongue } from "../lib/audio";
import { noteMidi, tonguePhrase } from "../lib/music";
import type { DrumKey } from "../lib/types";
import { DegreeMark } from "./Notation";
import { DrumDiagram } from "./DrumDiagram";

type Props = {
  drumKey: DrumKey;
};

function strum(key: DrumKey, voicing: ChordVoicing, timers: MutableRefObject<number[]>) {
  unlockAudio();
  for (const timer of timers.current) window.clearTimeout(timer);
  timers.current = [];
  const play = (index: number) => {
    const tone = voicing.tones[index];
    if (!tone) return;
    playTongue(noteMidi(key, tone.deg, tone.oct));
  };
  play(0);
  if (voicing.tones.length > 1) play(1);
  voicing.tones.slice(2).forEach((_, offset) => {
    const timer = window.setTimeout(() => play(offset + 2), 90 * (offset + 1));
    timers.current.push(timer);
  });
}

export function ChordsView({ drumKey }: Props) {
  const [roman, setRoman] = useState<Chord["roman"]>("I");
  const [voicingIndex, setVoicingIndex] = useState(0);
  const timers = useRef<number[]>([]);
  const layoutId = CHORD_LAYOUT[drumKey];
  const selectedChord = CHORDS.find((chord) => chord.roman === roman) ?? CHORDS[0];
  const voicings = selectedChord.voicings[drumKey];
  const safeIndex = voicings.length === 0 ? 0 : Math.min(voicingIndex, voicings.length - 1);
  const selected = voicings[safeIndex] ?? null;

  useEffect(() => {
    setVoicingIndex(0);
  }, [drumKey]);

  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );

  const choose = (nextRoman: Chord["roman"], index: number) => {
    setRoman(nextRoman);
    setVoicingIndex(index);
  };

  return (
    <div className="chords-page">
      <header className="song-head">
        <p className="kicker">Tongues that make a chord</p>
        <h1>Chords</h1>
        <p>
          Numbers are scale degrees. A dot below is the lower octave and a dot above is the higher one. The page follows
          the {drumKey} major toggle: the C drum is the 11-note layout and the D drum is the 15-note layout.
        </p>
      </header>

      <div className="chords-stage">
        <section className="panel" aria-labelledby="voicing-heading">
          <div className="panel-head">
            <h2 id="voicing-heading">Voicings in {drumKey} major</h2>
            <p>
              {layoutId}-note {drumKey} drum. {selected ? chordLabel(selectedChord) : "Choose a voicing to light the drum."}
            </p>
          </div>
          <ul className="voicing-list">
            {CHORDS.map((chord) => {
              const options = chord.voicings[drumKey];
              return (
                <li key={chord.roman}>
                  <p className="voicing-label">{chordLabel(chord)}</p>
                  {options.length === 0 ? (
                    <p className="voicing-empty">Shown in the table only.</p>
                  ) : (
                    <div className="voicing-options">
                      {options.map((voicing, index) => {
                        const on = chord.roman === roman && index === safeIndex;
                        const names = voicing.tones.map((tone) => tonguePhrase(drumKey, tone)).join(", ");
                        return (
                          <div key={voicing.id} className="voicing-row">
                            <button
                              type="button"
                              className={on ? "voicing is-selected" : "voicing"}
                              aria-pressed={on}
                              aria-label={`${chordLabel(chord)}: ${names}`}
                              onClick={() => choose(chord.roman, index)}
                            >
                              {voicing.tones.map((tone) => (
                                <DegreeMark key={`${tone.deg}:${tone.oct}`} deg={tone.deg} oct={tone.oct} />
                              ))}
                            </button>
                            <button
                              type="button"
                              className="scroll-play"
                              onClick={() => {
                                choose(chord.roman, index);
                                strum(drumKey, voicing, timers);
                              }}
                            >
                              Play
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="panel chords-diagram diagram-panel">
          <h2 className="sr-only">Drum</h2>
          <DrumDiagram layoutId={layoutId} drumKey={drumKey} active={null} chordTones={selected?.tones ?? []} />
          <p className="now">
            <span className="now-kicker">Voicing</span>
            <span className="now-value">{selected ? chordLabel(selectedChord) : "None selected"}</span>
          </p>
          <p className="diagram-caption">
            {selected
              ? selected.tones.map((tone) => tonguePhrase(drumKey, tone)).join(" · ")
              : "Select a voicing to highlight its tongues."}{" "}
            Chord tongues are teal. Playback on a song still lights a tongue gold.
          </p>
        </aside>
      </div>

      <section className="panel" aria-labelledby="chord-table-heading">
        <div className="panel-head">
          <h2 id="chord-table-heading">Both keys</h2>
          <p>The same scale degrees, named in C major and in D major.</p>
        </div>
        <div className="chord-table-wrap">
          <table className="chord-table">
            <thead>
              <tr>
                <th scope="col">Numeral</th>
                <th scope="col">Degrees</th>
                <th scope="col">In C</th>
                <th scope="col">In D</th>
              </tr>
            </thead>
            <tbody>
              {CHORDS.map((chord) => (
                <tr key={chord.roman}>
                  <th scope="row">{chord.roman}</th>
                  <td>{chord.degrees.join("-")}</td>
                  <td className={drumKey === "C" ? "is-current" : undefined}>{chord.name.C}</td>
                  <td className={drumKey === "D" ? "is-current" : undefined}>{chord.name.D}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel" aria-labelledby="chord-tips-heading">
        <h2 id="chord-tips-heading">Tips</h2>
        <ul className="legend">
          <li>You only have two hands, so strike two notes of the chord together and roll the third right after (an arpeggio).</li>
          <li>Most songs only need I, IV, V and vi. Common progressions: I–IV–V–I and I–vi–IV–V.</li>
        </ul>
      </section>
    </div>
  );
}
