import { useEffect, useMemo, useState } from "react";
import { DrumDiagram } from "./DrumDiagram";
import { Notation } from "./Notation";
import { PlayerBar } from "./PlayerBar";
import {
  eventIndex,
  flattenLines,
  layoutById,
  layoutNotation,
  layoutPitchRange,
  meterHelp,
  minimumLayout,
  missingTongues,
  noteMidi,
  parseNote,
  tonguePhrase,
  type NoteEvent,
} from "../lib/music";
import { findSong } from "../lib/songs";
import { usePlayer } from "../lib/usePlayer";
import type { DrumKey, LayoutId, License, Song } from "../lib/types";

const LICENSE_LABEL: Record<License, string> = {
  "public-domain": "Public domain",
  CC0: "CC0",
  "CC-BY-4.0": "CC BY 4.0",
  "CC-BY-SA-4.0": "CC BY-SA 4.0",
  "other-permissive": "Other permissive license",
};

type Props = {
  songId: string;
  drumKey: DrumKey;
  layout: LayoutId;
};

export function SongView({ songId, drumKey, layout }: Props) {
  const song = findSong(songId);
  if (!song) {
    return (
      <div className="song-page">
        <a className="back" href="#/">
          All songs
        </a>
        <h1>That tune isn’t in the library</h1>
        <p>It may have been renamed. Head back and pick another.</p>
      </div>
    );
  }
  return <SongPractice key={song.id} song={song} drumKey={drumKey} layout={layout} />;
}

function SongPractice({ song, drumKey, layout }: { song: Song; drumKey: DrumKey; layout: LayoutId }) {
  const [bpm, setBpm] = useState(song.tempo);
  const arrangement = song.arrangements[drumKey];
  const parsed = useMemo(() => {
    try {
      const lines = arrangement.lines.map((line) => ({
        lyric: line.lyric,
        notes: line.notes.map((note) => parseNote(note)),
      }));
      return { lines, error: null as string | null };
    } catch (error) {
      return {
        lines: [] as { lyric?: string; notes: NoteEvent[] }[],
        error: error instanceof Error ? error.message : "Could not read this song",
      };
    }
  }, [arrangement]);

  const events = useMemo(() => flattenLines(parsed.lines), [parsed.lines]);
  const laid = useMemo(
    () => (parsed.error ? [] : layoutNotation(parsed.lines, song.timeSignature)),
    [parsed, song.timeSignature],
  );
  const notes = useMemo(() => parsed.lines.flatMap((line) => line.notes), [parsed.lines]);
  const missing = useMemo(() => missingTongues(notes, layout), [notes, layout]);
  const missingSet = useMemo(() => new Set(missing.map((tongue) => `${tongue.deg}:${tongue.oct}`)), [missing]);
  const needed = minimumLayout(notes) ?? arrangement.minLayout;

  const midiFor = useMemo(
    () => (event: { rest: boolean; deg?: number; oct?: number }) => {
      if (event.rest || event.deg == null || event.oct == null) return null;
      if (!layoutById(layout).tongues.some((tongue) => tongue.deg === event.deg && tongue.oct === event.oct)) {
        return null;
      }
      return noteMidi(drumKey, event.deg, event.oct);
    },
    [drumKey, layout],
  );

  const player = usePlayer(events, bpm, midiFor);
  const active = player.index >= 0 ? events[player.index] : undefined;

  useEffect(() => {
    player.stop();
    setBpm(song.tempo);
    // Reset only when the song changes. Key and layout keep your place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select")) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        player.step(1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        player.step(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        player.jumpTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        player.jumpTo(events.length - 1);
      } else if (event.key === " ") {
        if (target?.closest("button, a")) return;
        event.preventDefault();
        player.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player, events.length]);

  useEffect(() => {
    if (player.index < 0) return;
    document.querySelector(".note.is-active")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [player.index]);

  const activeTongue =
    active && !active.rest && active.deg != null && active.oct != null ? { deg: active.deg, oct: active.oct } : null;
  const activeOnDrum = activeTongue != null && !missingSet.has(`${activeTongue.deg}:${activeTongue.oct}`);
  const range = layoutPitchRange(layout, drumKey);
  const layoutInfo = layoutById(layout);
  const nowText = !active
    ? "Tap the drum, or press play"
    : active.rest
      ? "Rest"
      : activeOnDrum
        ? tonguePhrase(drumKey, activeTongue!)
        : `${tonguePhrase(drumKey, activeTongue!)} · not on this drum`;

  return (
    <div className="song-page">
      <a className="back" href="#/">
        All songs
      </a>
      <header className="song-head">
        <p className="kicker">{song.artist}</p>
        <h1>{song.title}</h1>
        <ul className="meta">
          <li className={`diff diff-${song.difficulty}`}>
            {song.difficulty === "easy" ? "Easy" : song.difficulty === "medium" ? "Medium" : "Hard"}
          </li>
          <li>{song.timeSignature}</li>
          <li>{song.tempo} BPM</li>
          {(song.tags ?? []).map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
        <p className="meter-help">{meterHelp(song.timeSignature)}</p>
      </header>

      {parsed.error ? (
        <div className="banner" role="alert">
          This song file could not be read. {parsed.error}
        </div>
      ) : null}

      {missing.length > 0 ? (
        <div className="banner" role="status">
          <strong>This tune needs a {needed}-note drum.</strong>{" "}
          The {layout}-note layout is missing {missing.map((tongue) => tonguePhrase(drumKey, tongue)).join(", ")}.
          Those notes are marked in the music and won’t light up on the drum.
        </div>
      ) : null}

      {!song.verified ? (
        <p className="unverified">This arrangement is not marked as verified note by note.</p>
      ) : null}

      <div className="practice-grid">
        <section className="panel notation-panel" aria-labelledby="notation-heading">
          <div className="panel-head">
            <h2 id="notation-heading">Notation</h2>
            <p>Same scale degrees on either drum. Note names follow {drumKey} major.</p>
          </div>
          <ul className="legend">
            <li>A number is a scale degree, 1–7.</li>
            <li>A dot above is the higher octave. A dot below is the lower one.</li>
            <li>An underline is an eighth note. A dot beside the number adds half a beat. A dash holds one more beat.</li>
            <li>0 is a rest.</li>
            {song.timeSignature === "6/8" ? (
              <li>In 6/8, each bar is two dotted-quarter pulses. The gap between them is the middle of the bar.</li>
            ) : null}
            {song.timeSignature === "2/2" ? (
              <li>In 2/2, each bar is two half-note pulses. The gap between them is the middle of the bar.</li>
            ) : null}
          </ul>
          {parsed.error ? null : (
            <Notation
              lines={laid}
              timeSignature={song.timeSignature}
              drumKey={drumKey}
              activeLine={active?.lineIndex ?? -1}
              activeNote={active?.noteIndex ?? -1}
              missing={missingSet}
              onSelect={(lineIndex, noteIndex) => {
                const index = eventIndex(events, lineIndex, noteIndex);
                if (index >= 0) player.jumpTo(index);
              }}
            />
          )}
        </section>

        <section className="panel diagram-panel">
          <h2 className="sr-only">Drum diagram</h2>
          <button
            type="button"
            className="drum-hit"
            onClick={() => player.step(1)}
            aria-label={
              active
                ? `Top-down ${layoutInfo.label} ${drumKey} major drum. Now ${nowText}. Tap for the next note.`
                : `Top-down ${layoutInfo.label} ${drumKey} major drum. Tap for the first note.`
            }
          >
            <DrumDiagram layoutId={layout} drumKey={drumKey} active={activeOnDrum ? activeTongue : null} />
          </button>
          <p className="now" aria-live={player.playing ? "off" : "polite"}>
            <span className="now-kicker">Now</span>
            <span className="now-value">{nowText}</span>
          </p>
          <p className="diagram-caption">
            {range.low}–{range.high}.{" "}
            {layout === "15"
              ? "Paired tongues, longer one lower, with low 3 in the center. A dot above the number is the higher octave; a dot below is the lower one."
              : `Low notes start at the top and climb clockwise. This is a schematic — a real drum’s tongues may sit in a different order.${layoutInfo.typical ? " Typical layout; makers vary." : ""}`}
          </p>
        </section>
      </div>

      <p className="practice-help" id="practice-help">
        Arrow keys step. Space plays and pauses. Tap a note, or tap the drum, to jump in.
      </p>

      <PlayerBar
        index={player.index}
        total={events.length}
        playing={player.playing}
        bpm={bpm}
        songBpm={song.tempo}
        onBpm={setBpm}
        onToggle={player.toggle}
        onPrev={() => player.step(-1)}
        onNext={() => player.step(1)}
      />

      <section className="panel attribution" aria-labelledby="source-heading">
        <h2 id="source-heading">Source and license</h2>
        <p>{song.attribution}</p>
        <p>
          <span className="license">{LICENSE_LABEL[song.license]}</span>
        </p>
        <p>
          <a href={song.source.url} target="_blank" rel="noreferrer">
            {song.source.name}
          </a>
        </p>
        {song.arrangerNotes ? <p className="arranger-notes">{song.arrangerNotes}</p> : null}
      </section>
    </div>
  );
}
