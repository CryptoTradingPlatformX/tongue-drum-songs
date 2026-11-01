import type { ReactNode } from "react";
import { blackMidiAfter, isWhiteMidi } from "../lib/pitch";

export type PianoKeyInfo = {
  extraClass?: string;
  label?: ReactNode;
  ariaLabel?: string;
  onClick?: () => void;
  middleC?: boolean;
};

export function PianoKeyboard({
  lowMidi,
  highMidi,
  ariaLabel,
  keyInfo,
}: {
  lowMidi: number;
  highMidi: number;
  ariaLabel: string;
  keyInfo: (midi: number) => PianoKeyInfo | null;
}) {
  const whites: number[] = [];
  for (let midi = lowMidi; midi <= highMidi; midi += 1) {
    if (isWhiteMidi(midi)) whites.push(midi);
  }
  return (
    <div className="piano-scroll">
      <div className="piano" role="group" aria-label={ariaLabel}>
        {whites.map((midi) => {
          const black = blackMidiAfter(midi);
          const showBlack = black != null && black <= highMidi;
          return (
            <div key={midi} className="piano-white-slot">
              <KeyFace info={keyInfo(midi)} white />
              {showBlack ? <KeyFace info={keyInfo(black)} white={false} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KeyFace({ info, white }: { info: PianoKeyInfo | null; white: boolean }) {
  const className = [white ? "piano-key is-white" : "piano-key is-black", info?.onClick ? "" : "is-inert", info?.extraClass ?? ""]
    .filter(Boolean)
    .join(" ");
  const body = (
    <>
      {info?.label}
      {info?.middleC ? <span className="piano-middle">middle C</span> : null}
    </>
  );
  if (!info?.onClick) {
    return (
      <div className={className} aria-hidden="true">
        {body}
      </div>
    );
  }
  return (
    <button type="button" className={className} aria-label={info.ariaLabel} onClick={info.onClick}>
      {body}
    </button>
  );
}
