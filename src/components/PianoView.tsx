import { useEffect, useRef, useState } from "react";
import { PIANO_LAYOUT, PIANO_TONGUES, PIANO_WHITE_KEYS, blackKeyAfter, type PianoTongue } from "../data/piano";
import { playTongue, unlockAudio } from "../lib/audio";
import { noteMidi, octaveWord, tonguePhrase } from "../lib/music";
import type { DrumKey, Tongue } from "../lib/types";
import { DegreeMark } from "./Notation";
import { DrumDiagram } from "./DrumDiagram";

type Props = { drumKey: DrumKey };

const HIT_MS = 450;

function sameTongue(a: Tongue | null, b: Tongue): boolean {
  return a != null && a.deg === b.deg && a.oct === b.oct;
}

export function PianoView({ drumKey }: Props) {
  const tongues = PIANO_TONGUES[drumKey];
  const byName = new Map(tongues.map((tongue) => [tongue.name, tongue]));
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
    playTongue(noteMidi(drumKey, tongue.deg, tongue.oct));
    setHit(tongue);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHit(null), HIT_MS);
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
          <div className="piano-scroll">
            <div className="piano" role="group" aria-label={`Piano from F3 to G5 for the ${drumKey} drum`}>
              {PIANO_WHITE_KEYS.map((name) => {
                const tongue = byName.get(name) ?? null;
                const blackName = blackKeyAfter(name);
                const blackTongue = blackName ? byName.get(blackName) ?? null : null;
                return (
                  <WhiteKey
                    key={name}
                    name={name}
                    tongue={tongue}
                    blackName={blackName}
                    blackTongue={blackTongue}
                    hit={hit}
                    onPlay={play}
                  />
                );
              })}
            </div>
          </div>
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

function WhiteKey({
  name,
  tongue,
  blackName,
  blackTongue,
  hit,
  onPlay,
}: {
  name: string;
  tongue: PianoTongue | null;
  blackName: string | null;
  blackTongue: PianoTongue | null;
  hit: Tongue | null;
  onPlay: (tongue: Tongue) => void;
}) {
  return (
    <div className="piano-white-slot">
      <KeyFace name={name} tongue={tongue} hit={hit} onPlay={onPlay} white />
      {blackName ? <KeyFace name={blackName} tongue={blackTongue} hit={hit} onPlay={onPlay} white={false} /> : null}
    </div>
  );
}

function KeyFace({
  name,
  tongue,
  hit,
  onPlay,
  white,
}: {
  name: string;
  tongue: PianoTongue | null;
  hit: Tongue | null;
  onPlay: (tongue: Tongue) => void;
  white: boolean;
}) {
  const drum = tongue != null;
  const active = drum && sameTongue(hit, tongue);
  const className = [
    white ? "piano-key is-white" : "piano-key is-black",
    drum ? "is-drum" : "is-inert",
    active ? "is-hit" : "",
    name === "C4" ? "is-middle-c" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const label = drum ? (
    <span className="piano-key-num" aria-hidden="true">
      {tongue.oct < 0 ? <i className="piano-dot below" /> : null}
      {tongue.deg}
      {tongue.oct > 0 ? <i className="piano-dot above" /> : null}
    </span>
  ) : null;
  const text = drum
    ? `${octaveWord(tongue.oct)}${tongue.deg}, ${name}${tongue.centerLikely ? ", center tongue, likely" : ""}${name === "C4" ? ", middle C" : ""}`
    : name;
  if (!drum) {
    return (
      <div className={className} aria-hidden="true">
        {name === "C4" ? <span className="piano-middle">middle C</span> : null}
      </div>
    );
  }
  return (
    <button type="button" className={className} aria-label={text} onClick={() => onPlay(tongue)}>
      {label}
      {name === "C4" ? <span className="piano-middle">middle C</span> : null}
    </button>
  );
}
