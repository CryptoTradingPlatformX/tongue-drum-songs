import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DrumDiagram } from "./DrumDiagram";
import { Notation } from "./Notation";
import { NotationTools } from "./NotationTools";
import { PlayerBar } from "./PlayerBar";
import { libraryBackHref } from "../lib/libraryUrl";
import {
  beatsPerBar,
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
  roundBeats,
  tonguePhrase,
  type DisplayLine,
  type NoteEvent,
} from "../lib/music";
import type { NoteSize } from "../lib/settings";
import { loadSong } from "../lib/songs";
import {
  clampSpeed,
  lineDurationMs,
  linesPerMinute,
  nextScrollLine,
  scrollBehavior,
  scrollTopFor,
} from "../lib/scroll";
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
  noteSize: NoteSize;
  onNoteSize: (size: NoteSize) => void;
  followScroll: boolean;
  onFollowScroll: (value: boolean) => void;
};

export function SongView({ songId, drumKey, layout, noteSize, onNoteSize, followScroll, onFollowScroll }: Props) {
  const [song, setSong] = useState<Song | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    setSong(undefined);
    loadSong(songId).then((found) => {
      if (live) setSong(found);
    });
    return () => {
      live = false;
    };
  }, [songId]);

  if (song === undefined) {
    return (
      <div className="song-page">
        <a className="back" href={libraryBackHref()}>
          All songs
        </a>
        <p className="loading-tune">Loading this tune…</p>
      </div>
    );
  }

  if (!song) {
    return (
      <div className="song-page">
        <a className="back" href={libraryBackHref()}>
          All songs
        </a>
        <h1>That tune isn’t in the library</h1>
        <p>It may have been renamed. Head back and pick another.</p>
      </div>
    );
  }

  return (
    <SongPractice
      key={song.id}
      song={song}
      drumKey={drumKey}
      layout={layout}
      noteSize={noteSize}
      onNoteSize={onNoteSize}
      followScroll={followScroll}
      onFollowScroll={onFollowScroll}
    />
  );
}

function lineBeats(line: DisplayLine): number {
  const raw = line.bars.reduce((sum, bar) => sum + bar.beats, 0);
  return roundBeats(raw);
}

function chromeHeight(): number {
  const header = document.querySelector(".top");
  const headerBottom = header instanceof HTMLElement ? header.getBoundingClientRect().bottom : 0;
  const tools = document.querySelector(".notation-tools");
  const toolsHeight = tools instanceof HTMLElement ? tools.getBoundingClientRect().height : 0;
  return headerBottom + toolsHeight;
}

function SongPractice({
  song,
  drumKey,
  layout,
  noteSize,
  onNoteSize,
  followScroll,
  onFollowScroll,
}: {
  song: Song;
  drumKey: DrumKey;
  layout: LayoutId;
  noteSize: NoteSize;
  onNoteSize: (size: NoteSize) => void;
  followScroll: boolean;
  onFollowScroll: (value: boolean) => void;
}) {
  const [bpm, setBpm] = useState(song.tempo);
  const [speed, setSpeed] = useState(1);
  const [manualPlaying, setManualPlaying] = useState(false);
  const [guide, setGuide] = useState<number | null>(null);
  const followedLine = useRef(-1);
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
  const averageBeats = useMemo(() => {
    if (!laid.length) return beatsPerBar(song.timeSignature);
    const total = laid.reduce((sum, line) => sum + lineBeats(line), 0);
    return total / laid.length || beatsPerBar(song.timeSignature);
  }, [laid, song.timeSignature]);

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
  const markedLine = player.playing || guide == null ? (active?.lineIndex ?? -1) : guide;

  const revealLine = useCallback((lineIndex: number, preferNote: boolean) => {
    const line = document.querySelector(`[data-line="${lineIndex}"]`);
    if (!(line instanceof HTMLElement)) return;
    const chrome = chromeHeight();
    const note = line.querySelector(".note.is-active");
    const lineRect = line.getBoundingClientRect();
    const room = window.innerHeight - chrome - 120;
    const focus = preferNote && note instanceof HTMLElement && lineRect.height > room ? note : line;
    const top = scrollTopFor(focus.getBoundingClientRect().top, window.scrollY, window.innerHeight, chrome);
    if (Math.abs(top - window.scrollY) < 12) return;
    window.scrollTo({ top, behavior: scrollBehavior() });
  }, []);

  const clearGuide = useCallback(() => {
    setManualPlaying(false);
    setGuide(null);
  }, []);

  useEffect(() => {
    player.stop();
    setBpm(song.tempo);
    setSpeed(1);
    setManualPlaying(false);
    setGuide(null);
    // Reset only when the song changes. Key and layout keep your place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  useEffect(() => {
    if (!player.playing) return;
    setManualPlaying(false);
    setGuide(null);
  }, [player.playing]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      if (target?.closest("input, textarea, select")) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        clearGuide();
        player.step(1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        clearGuide();
        player.step(-1);
      } else if (event.key === "Home") {
        event.preventDefault();
        clearGuide();
        player.jumpTo(0);
      } else if (event.key === "End") {
        event.preventDefault();
        clearGuide();
        player.jumpTo(events.length - 1);
      } else if (event.key === " ") {
        if (target?.closest("button, a")) return;
        event.preventDefault();
        player.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player, events.length, clearGuide]);

  useEffect(() => {
    const fromControls = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      return Boolean(target?.closest("[data-scroll-controls]"));
    };
    const pauseForInput = (event: Event) => {
      if (fromControls(event)) return;
      setManualPlaying(false);
    };
    const onKeyScroll = (event: KeyboardEvent) => {
      if (event.key === "PageDown" || event.key === "PageUp") setManualPlaying(false);
    };
    window.addEventListener("wheel", pauseForInput, { passive: true });
    window.addEventListener("touchmove", pauseForInput, { passive: true });
    window.addEventListener("pointerdown", pauseForInput);
    window.addEventListener("keydown", onKeyScroll);
    return () => {
      window.removeEventListener("wheel", pauseForInput);
      window.removeEventListener("touchmove", pauseForInput);
      window.removeEventListener("pointerdown", pauseForInput);
      window.removeEventListener("keydown", onKeyScroll);
    };
  }, []);

  useEffect(() => {
    if (!player.playing || !followScroll) return;
    const lineIndex = active?.lineIndex ?? -1;
    if (lineIndex < 0) return;
    const note = document.querySelector(".note.is-active");
    const rect = note instanceof HTMLElement ? note.getBoundingClientRect() : null;
    const chrome = chromeHeight();
    const hidden = !rect || rect.top < chrome - 4 || rect.bottom > window.innerHeight - 96;
    if (followedLine.current === lineIndex && !hidden) return;
    followedLine.current = lineIndex;
    revealLine(lineIndex, true);
  }, [player.playing, player.index, followScroll, active?.lineIndex, active?.noteIndex, revealLine]);

  useEffect(() => {
    if (!manualPlaying || guide == null) return;
    const line = laid[guide];
    if (!line) {
      setManualPlaying(false);
      return;
    }
    revealLine(guide, false);
    const beats = Math.max(lineBeats(line), 0.25);
    const step = nextScrollLine(guide, laid.length);
    const timer = window.setTimeout(() => {
      if (step.playing) setGuide(step.line);
      else setManualPlaying(false);
    }, lineDurationMs(beats, bpm, speed));
    return () => window.clearTimeout(timer);
  }, [manualPlaying, guide, laid, bpm, speed, revealLine]);

  const startManual = () => {
    if (!laid.length) return;
    player.pause();
    const last = laid.length - 1;
    const fromPlayer = active?.lineIndex ?? -1;
    let next = fromPlayer >= 0 ? fromPlayer : (guide ?? 0);
    if (next >= last) next = 0;
    setGuide(Math.max(0, next));
    setManualPlaying(true);
  };

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
    <div className={`song-page notes-${noteSize}`}>
      <a className="back" href={libraryBackHref()}>
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
          <NotationTools
            noteSize={noteSize}
            onNoteSize={onNoteSize}
            followScroll={followScroll}
            onFollowScroll={onFollowScroll}
            manualPlaying={manualPlaying}
            onToggleManual={() => (manualPlaying ? setManualPlaying(false) : startManual())}
            canScroll={laid.length > 0}
            speed={speed}
            onSpeed={(value) => setSpeed(clampSpeed(value))}
            linesPerMinute={linesPerMinute(averageBeats, bpm, speed)}
            bpm={bpm}
          />
          <ul className="legend">
            <li>A number is a scale degree, 1–7.</li>
            <li>A dot above is the higher octave. A dot below is the lower one.</li>
            <li>An underline is an eighth note. A dot beside the number adds half a beat. A dash holds one more beat.</li>
            <li>A 3 over three underlined notes is a triplet. Those three notes add up to one beat.</li>
            <li>0 is a rest.</li>
            {song.timeSignature === "6/8" ? (
              <li>In 6/8, each bar is two dotted-quarter pulses. The gap between them is the middle of the bar.</li>
            ) : null}
            {song.timeSignature === "9/8" ? (
              <li>In 9/8, each bar is three dotted-quarter pulses. The gaps mark those pulses.</li>
            ) : null}
            {song.timeSignature === "12/8" ? (
              <li>In 12/8, each bar is four dotted-quarter pulses. The gaps mark those pulses.</li>
            ) : null}
            {song.timeSignature === "2/2" ? (
              <li>In 2/2, each bar is two half-note pulses. The gap between them is the middle of the bar.</li>
            ) : null}
            {song.timeSignature === "3/2" ? (
              <li>In 3/2, each bar is three half-note pulses. The gaps mark those pulses.</li>
            ) : null}
            {song.timeSignature === "4/2" ? (
              <li>In 4/2, each bar is four half-note pulses. The gaps mark those pulses.</li>
            ) : null}
          </ul>
          {parsed.error ? null : (
            <Notation
              lines={laid}
              timeSignature={song.timeSignature}
              drumKey={drumKey}
              activeLine={active?.lineIndex ?? -1}
              activeNote={active?.noteIndex ?? -1}
              markedLine={markedLine}
              missing={missingSet}
              onSelect={(lineIndex, noteIndex) => {
                clearGuide();
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
            onClick={() => {
              clearGuide();
              player.step(1);
            }}
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
        Arrow keys step. Space plays and pauses. Tap a note, or tap the drum, to jump in. Scroll along moves down the
        page without playing audio, and pauses if you scroll or tap.
      </p>

      <PlayerBar
        index={player.index}
        total={events.length}
        playing={player.playing}
        bpm={bpm}
        songBpm={song.tempo}
        onBpm={setBpm}
        onToggle={player.toggle}
        onPrev={() => {
          clearGuide();
          player.step(-1);
        }}
        onNext={() => {
          clearGuide();
          player.step(1);
        }}
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
