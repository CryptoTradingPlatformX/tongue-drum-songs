import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { CHORD_LAYOUT, CHORDS, chordLabel, type Chord, type ChordTone } from "../data/chords";
import { playTongue, unlockAudio } from "../lib/audio";
import { octaveWord } from "../lib/music";
import {
  MAJOR_KEYS,
  degreePitch,
  naturalMidi,
  scalePitchClasses,
  scaleSpelling,
  spelledChordName,
  whiteKeySpan,
  type MajorKey,
} from "../lib/pitch";
import type { DrumKey, LayoutId } from "../lib/types";
import { DegreeMark } from "./Notation";
import { DrumDiagram } from "./DrumDiagram";
import { PianoKeyboard, type PianoKeyInfo } from "./PianoKeyboard";

type Props = {
  drumKey: DrumKey;
};

function isSteven(root: MajorKey, homeOctave: number): root is DrumKey {
  return (root === "C" || root === "D") && homeOctave === 4;
}

function strum(midis: number[], timers: MutableRefObject<number[]>) {
  unlockAudio();
  for (const timer of timers.current) window.clearTimeout(timer);
  timers.current = [];
  const play = (index: number) => {
    const midi = midis[index];
    if (midi == null) return;
    playTongue(midi);
  };
  play(0);
  if (midis.length > 1) play(1);
  midis.slice(2).forEach((_, offset) => {
    const timer = window.setTimeout(() => play(offset + 2), 90 * (offset + 1));
    timers.current.push(timer);
  });
}

function toneMidi(root: MajorKey, homeOctave: number, tone: ChordTone): number {
  return degreePitch(root, homeOctave, tone.deg, tone.oct).midi;
}

export function ChordsView({ drumKey }: Props) {
  const [root, setRoot] = useState<MajorKey>(drumKey);
  const [homeOctave, setHomeOctave] = useState<3 | 4>(4);
  const [roman, setRoman] = useState<Chord["roman"]>("I");
  const [voicingIndex, setVoicingIndex] = useState(0);
  const timers = useRef<number[]>([]);
  const steven = isSteven(root, homeOctave);
  const layoutId: LayoutId = steven ? CHORD_LAYOUT[root] : "15";
  const selectedChord = CHORDS.find((chord) => chord.roman === roman) ?? CHORDS[0];
  const voicings = steven ? selectedChord.voicings[root] : selectedChord.voicings.D;
  const safeIndex = voicings.length === 0 ? 0 : Math.min(voicingIndex, voicings.length - 1);
  const selected = voicings[safeIndex] ?? null;
  const scaleClasses = new Set(scalePitchClasses(root));
  const spanMidis = [1, 2, 3, 4, 5, 6, 7].flatMap((degree) =>
    [-1, 0, 1].map((oct) => degreePitch(root, homeOctave, degree, oct).midi),
  );
  const span = steven
    ? { low: naturalMidi("F", 3), high: naturalMidi("G", 5) }
    : whiteKeySpan(Math.min(...spanMidis), Math.max(...spanMidis));

  useEffect(() => {
    setRoot(drumKey);
    setHomeOctave(4);
    setVoicingIndex(0);
  }, [drumKey]);

  useEffect(
    () => () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    },
    [],
  );

  useEffect(() => {
    const key = document.querySelector(".chords-piano .piano-key.is-voicing");
    const scroller = document.querySelector(".chords-piano .piano-scroll");
    if (key instanceof HTMLElement && scroller instanceof HTMLElement) {
      scroller.scrollLeft = Math.max(0, key.offsetLeft - 16);
    }
  }, [root, homeOctave, roman, safeIndex]);

  const choose = (nextRoman: Chord["roman"], index: number) => {
    setRoman(nextRoman);
    setVoicingIndex(index);
  };

  const heading = steven ? chordLabel(selectedChord) : `${selectedChord.roman} = ${spelledChordName(root, selectedChord.roman)}`;

  const tonePhrase = (tone: ChordTone) => {
    const pitch = degreePitch(root, homeOctave, tone.deg, tone.oct);
    return `${octaveWord(tone.oct)}${tone.deg} (${pitch.name})`;
  };

  const keyInfo = (midi: number): PianoKeyInfo | null => {
    const pc = ((midi % 12) + 12) % 12;
    const tone = selected?.tones.find((item) => toneMidi(root, homeOctave, item) === midi) ?? null;
    const inScale = scaleClasses.has(pc);
    if (!tone && !inScale && midi !== naturalMidi("C", 4)) return null;
    return {
      extraClass: tone ? "is-voicing" : inScale ? "is-scale" : "",
      label: tone ? (
        <span className="piano-key-num" aria-hidden="true">
          {tone.oct < 0 ? <i className="piano-dot below" /> : null}
          {tone.deg}
          {tone.oct > 0 ? <i className="piano-dot above" /> : null}
        </span>
      ) : inScale ? (
        <i className="piano-scale-dot" aria-hidden="true" />
      ) : null,
      ariaLabel: tone ? tonePhrase(tone) : inScale ? `${scaleLetter(root, pc)}, in the scale` : "middle C",
      onClick:
        tone || inScale
          ? () => {
              unlockAudio();
              playTongue(midi);
            }
          : undefined,
      middleC: midi === naturalMidi("C", 4),
    };
  };

  return (
    <div className="chords-page">
      <header className="song-head">
        <p className="kicker">Tongues that make a chord</p>
        <h1>Chords</h1>
        <p>
          Numbers are scale degrees. A dot below is the lower octave and a dot above is the higher one.{" "}
          {steven
            ? `C and D at home octave 4 are the drums: C is the 11-note layout and D is the 15-note layout. Another key is a theory view.`
            : `${root} major is a theory view, with home 1 in octave ${homeOctave}. The drum picture is a generic 15-note layout, not a specific instrument.`}
        </p>
        <div className="key-picker">
          <label>
            Key
            <select
              value={root}
              onChange={(event) => {
                setRoot(event.target.value as MajorKey);
                setVoicingIndex(0);
              }}
            >
              {MAJOR_KEYS.map((key) => (
                <option key={key} value={key}>
                  {key} major
                </option>
              ))}
            </select>
          </label>
          <label>
            Home 1
            <select
              value={homeOctave}
              onChange={(event) => {
                setHomeOctave(Number(event.target.value) as 3 | 4);
                setVoicingIndex(0);
              }}
            >
              <option value={4}>Octave 4</option>
              <option value={3}>Octave 3</option>
            </select>
          </label>
        </div>
      </header>

      <div className="chords-stage">
        <section className="panel" aria-labelledby="voicing-heading">
          <div className="panel-head">
            <h2 id="voicing-heading">Voicings in {root} major</h2>
            <p>
              {steven ? `${layoutId}-note ${root} drum. ` : "Theory view. "}
              {selected ? heading : "Choose a voicing to light the drum."}
            </p>
          </div>
          <ul className="voicing-list">
            {CHORDS.map((chord) => {
              const options = steven ? chord.voicings[root] : chord.voicings.D;
              const label = steven ? chordLabel(chord) : `${chord.roman} = ${spelledChordName(root, chord.roman)}`;
              return (
                <li key={chord.roman}>
                  <p className="voicing-label">{label}</p>
                  {options.length === 0 ? (
                    <p className="voicing-empty">Shown in the table only.</p>
                  ) : (
                    <div className="voicing-options">
                      {options.map((voicing, index) => {
                        const on = chord.roman === roman && index === safeIndex;
                        const names = voicing.tones.map((tone) => tonePhrase(tone)).join(", ");
                        return (
                          <div key={voicing.id} className="voicing-row">
                            <button
                              type="button"
                              className={on ? "voicing is-selected" : "voicing"}
                              aria-pressed={on}
                              aria-label={`${label}: ${names}`}
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
                                strum(
                                  voicing.tones.map((tone) => toneMidi(root, homeOctave, tone)),
                                  timers,
                                );
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
          <DrumDiagram
            layoutId={layoutId}
            drumKey={steven ? root : "D"}
            active={null}
            chordTones={selected?.tones ?? []}
            pitchLabel={
              steven
                ? undefined
                : (tongue) => degreePitch(root, homeOctave, tongue.deg, tongue.oct).name
            }
          />
          <p className="now">
            <span className="now-kicker">Voicing</span>
            <span className="now-value">{selected ? heading : "None selected"}</span>
          </p>
          <p className="diagram-caption">
            {selected
              ? selected.tones.map((tone) => tonePhrase(tone)).join(" · ")
              : "Select a voicing to highlight its tongues."}{" "}
            {steven
              ? "Chord tongues are teal. Playback on a song still lights a tongue gold."
              : "Generic 15-note picture of these degrees. It is not a specific drum."}
          </p>
        </aside>

        <section className="panel chords-piano" aria-labelledby="chord-piano-heading">
          <div className="panel-head">
            <h2 id="chord-piano-heading">Piano</h2>
            <p>
              {steven
                ? "Teal keys are this voicing. Dots mark the rest of the scale."
                : `Teal keys are this voicing in ${root} major. Dots mark the scale.`}
            </p>
          </div>
          <PianoKeyboard
            lowMidi={span.low}
            highMidi={span.high}
            ariaLabel={`Piano for ${root} major, home octave ${homeOctave}`}
            keyInfo={keyInfo}
          />
        </section>
      </div>

      <section className="panel" aria-labelledby="chord-table-heading">
        <div className="panel-head">
          <h2 id="chord-table-heading">{steven ? "Both keys" : `${root} major`}</h2>
          <p>
            {steven
              ? "The same scale degrees, named in C major and in D major."
              : "Chord names are spelled from this key. Home 1 is in octave " + homeOctave + "."}
          </p>
        </div>
        <div className="chord-table-wrap">
          {steven ? (
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
                    <td className={root === "C" ? "is-current" : undefined}>{chord.name.C}</td>
                    <td className={root === "D" ? "is-current" : undefined}>{chord.name.D}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="chord-table">
              <thead>
                <tr>
                  <th scope="col">Numeral</th>
                  <th scope="col">Degrees</th>
                  <th scope="col">Chord</th>
                </tr>
              </thead>
              <tbody>
                {CHORDS.map((chord) => (
                  <tr key={chord.roman}>
                    <th scope="row">{chord.roman}</th>
                    <td>{chord.degrees.join("-")}</td>
                    <td className="is-current">{spelledChordName(root, chord.roman)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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

function scaleLetter(root: MajorKey, pitchClass: number): string {
  const index = scalePitchClasses(root).indexOf(pitchClass);
  return index < 0 ? "Scale tone" : scaleSpelling(root)[index];
}
