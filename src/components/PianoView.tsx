import { useEffect, useRef, useState } from "react";
import { PIANO_LAYOUT, PIANO_TONGUES, type PianoTongue } from "../data/piano";
import { playTongue, unlockAudio } from "../lib/audio";
import { octaveWord, tonguePhrase } from "../lib/music";
import { degreePitch, naturalMidi } from "../lib/pitch";
import type { DrumKey, Tongue } from "../lib/types";
import { DegreeMark } from "./Notation";
import { DrumDiagram } from "./DrumDiagram";
import { PianoKeyboard, type PianoKeyInfo } from "./PianoKeyboard";

type Props = { drumKey: DrumKey };

const HIT_MS = 450;

function sameTongue(a: Tongue | null, b: Tongue): boolean {
  return a != null && a.deg === b.deg && a.oct === b.oct;
}

function DegreeLabel({ tongue }: { tongue: PianoTongue }) {
  return (
    <span className="piano-key-num" aria-hidden="true">
      {tongue.oct < 0 ? <i className="piano-dot below" /> : null}
      {tongue.deg}
      {tongue.oct > 0 ? <i className="piano-dot above" /> : null}
    </span>
  );
}

export function PianoView({ drumKey }: Props) {
  const tongues = PIANO_TONGUES[drumKey];
  const byMidi = new Map(tongues.map((tongue) => [degreePitch(drumKey, 4, tongue.deg, tongue.oct).midi, tongue]));
  const [hit, setHit] = useState<Tongue | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    },
    [],
  );

  const play = (tongue: Tongue) => {
    unlockAudio();
    playTongue(degreePitch(drumKey, 4, tongue.deg, tongue.oct).midi);
    setHit(tongue);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHit(null), HIT_MS);
  };

  const keyInfo = (midi: number): PianoKeyInfo | null => {
    const tongue = byMidi.get(midi) ?? null;
    if (!tongue) return midi === naturalMidi("C", 4) ? { middleC: true } : null;
    const active = sameTongue(hit, tongue);
    const pitch = degreePitch(drumKey, 4, tongue.deg, tongue.oct);
    return {
      extraClass: active ? "is-drum is-hit" : "is-drum",
      label: <DegreeLabel tongue={tongue} />,
      ariaLabel: `${octaveWord(tongue.oct)}${tongue.deg}, ${pitch.name}${tongue.centerLikely ? ", center tongue, likely" : ""}${pitch.name === "C4" ? ", middle C" : ""}`,
      onClick: () => play(tongue),
      middleC: pitch.name === "C4",
    };
  };

  return (
    <div className="piano-page">
      <header className="song-head">
        <p className="kicker">Where each tongue sits on a piano</p>
        <h1>Drum to piano</h1>
        <p>
          The numbers are scale degrees, so 1 is always the drum's home note — C on the C drum and D on the D drum.
          That's why the same song number lands on different piano keys on each drum. A dot below a number means the
          octave below; a dot above means the octave above.
        </p>
      </header>

      <div className="piano-stage">
        <section className="panel" aria-labelledby="piano-map-heading">
          <div className="panel-head">
            <h2 id="piano-map-heading">{drumKey} major · {PIANO_LAYOUT[drumKey]}-note drum</h2>
            <p>C4 is middle C. Highlighted piano keys are the tongues on this drum.</p>
          </div>
          <PianoKeyboard
            lowMidi={naturalMidi("F", 3)}
            highMidi={naturalMidi("G", 5)}
            ariaLabel={`Piano from F3 to G5 for the ${drumKey} drum`}
            keyInfo={keyInfo}
          />
          <table className="chord-table piano-map">
            <thead>
              <tr>
                <th scope="col">Tongue</th>
                <th scope="col">Piano key</th>
              </tr>
            </thead>
            <tbody>
              {tongues.map((tongue) => (
                <tr key={`${tongue.deg}:${tongue.oct}`}>
                  <th scope="row">
                    <button type="button" className="piano-tongue" onClick={() => play(tongue)}>
                      <DegreeMark deg={tongue.deg} oct={tongue.oct} />
                      <span>{octaveWord(tongue.oct)}{tongue.deg}</span>
                    </button>
                  </th>
                  <td>
                    {tongue.name}
                    {tongue.name === "C4" ? " · middle C" : ""}
                    {tongue.centerLikely ? " · center tongue, likely" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <aside className="panel diagram-panel piano-diagram">
          <h2 className="sr-only">Drum</h2>
          <DrumDiagram
            layoutId={PIANO_LAYOUT[drumKey]}
            drumKey={drumKey}
            active={hit}
            onTongue={play}
          />
          <p className="diagram-caption">
            Tap a tongue or a highlighted piano key. {hit ? `Now ${tonguePhrase(drumKey, hit)}.` : "The gold flash is the note you just played."}
          </p>
        </aside>
      </div>
    </div>
  );
}
