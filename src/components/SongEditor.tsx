import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DRUM_LAYOUT, generateArrangement, otherDrum, tongueLabel } from "../lib/arrangements";
import { endRecordingAudio, playClick, playTongue, unlockAudio } from "../lib/audio";
import { detectNotes, type DetectedNote } from "../lib/detect";
import { describeMicError, listenToMicrophone, openMicrophone, recordingSession } from "../lib/microphone";
import { createEditor, editorReducer, type EditorLine, type EditorState } from "../lib/editor";
import {
  beatsPerBar,
  beatsToTicks,
  eventIndex,
  flattenLines,
  formatBeats,
  layoutById,
  layoutNotation,
  meterHelp,
  noteMidi,
  parseNote,
  pitchCompare,
  roundBeats,
  totalBeats,
  type DisplayLine,
  type NoteEvent,
  type PlayEvent,
} from "../lib/music";
import { allocateId, buildPersonalSong, editorLines, exportSongs, isPlayable, issuesForPersonalSong, playableDrum, slugifyTitle, type SongFile } from "../lib/mySongs";
import {
  clampSpeed,
  lineDurationMs,
  linesPerMinute,
  nextScrollLine,
  noteFitsViewport,
  scrollBehavior,
  scrollTopFor,
} from "../lib/scroll";
import type { NoteSize } from "../lib/settings";
import type { SongStore } from "../lib/songStore";
import type { DrumKey, TimeSignature, Tongue } from "../lib/types";
import { usePlayer } from "../lib/usePlayer";
import { DrumDiagram } from "./DrumDiagram";
import { Notation } from "./Notation";
import { NotationTools } from "./NotationTools";
import { PlayerBar } from "./PlayerBar";

const DURATIONS: { dur: number; label: string }[] = [
  { dur: 4, label: "Whole" },
  { dur: 3, label: "Dotted half" },
  { dur: 2, label: "Half" },
  { dur: 1.5, label: "Dotted quarter" },
  { dur: 1, label: "Quarter" },
  { dur: 0.75, label: "Dotted eighth" },
  { dur: 0.5, label: "Eighth" },
  { dur: 0.25, label: "16th" },
];

const METERS: TimeSignature[] = ["4/4", "3/4", "2/4", "2/2", "3/2", "4/2", "6/4", "6/8", "9/8", "12/8"];

type Props = {
  songId: string;
  store: SongStore;
  taken: Set<string>;
  noteSize: NoteSize;
  onNoteSize: (size: NoteSize) => void;
  followScroll: boolean;
  onFollowScroll: (value: boolean) => void;
};

function lineBeats(line: DisplayLine): number {
  return roundBeats(line.bars.reduce((sum, bar) => sum + bar.beats, 0));
}

function barStatus(lines: EditorLine[], meter: TimeSignature): string {
  const notes = lines.flatMap((line) => line.notes);
  if (notes.length === 0) return "No notes yet.";
  const total = totalBeats(notes);
  const per = beatsPerBar(meter);
  const remainder = beatsToTicks(total) % beatsToTicks(per);
  if (remainder === 0) return `${formatBeats(total)} beats. The last bar is full.`;
  return `${formatBeats(total)} beats. ${formatBeats(remainder / beatsToTicks(1))} of ${formatBeats(per)} in the current bar.`;
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([`${JSON.stringify(data, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

let safeInsetsCache: { top: number; bottom: number } | null = null;

function chromeInsets(): { top: number; bottom: number } {
  if (!safeInsetsCache) {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
    document.body.appendChild(probe);
    const style = getComputedStyle(probe);
    const top = parseFloat(style.paddingTop);
    const bottom = parseFloat(style.paddingBottom);
    probe.remove();
    safeInsetsCache = {
      top: Number.isFinite(top) ? top : 0,
      bottom: Number.isFinite(bottom) ? bottom : 0,
    };
  }
  let top = safeInsetsCache.top;
  let bottom = safeInsetsCache.bottom;
  document.querySelectorAll("[data-sticky-chrome]").forEach((node) => {
    if (!(node instanceof HTMLElement)) return;
    const position = getComputedStyle(node).position;
    if (position !== "sticky" && position !== "fixed") return;
    const rect = node.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    if (rect.top >= -1 && rect.top < window.innerHeight * 0.55 && rect.bottom > top) top = rect.bottom + 8;
    if (rect.bottom >= window.innerHeight - 1 && rect.top < window.innerHeight) {
      bottom = Math.max(bottom, window.innerHeight - rect.top + 8);
    }
  });
  return { top, bottom };
}

export function SongEditor(props: Props) {
  const [initial, setInitial] = useState<EditorState | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let live = true;
    setInitial(null);
    setMissing(false);
    if (props.songId === "new") {
      setInitial(createEditor());
      return () => {
        live = false;
      };
    }
    props.store.get(props.songId).then((record) => {
      if (!live) return;
      if (!record) {
        setMissing(true);
        return;
      }
      const drum = playableDrum(record.song);
      const arrangement = record.song.arrangements[drum];
      setInitial(
        createEditor({
          id: record.song.id,
          title: record.song.title,
          tempo: record.song.tempo,
          timeSignature: record.song.timeSignature,
          drum,
          lines: isPlayable(arrangement) ? editorLines(arrangement) : [{ lyric: "", notes: [] }],
        }),
      );
    });
    return () => {
      live = false;
    };
  }, [props.songId, props.store]);

  if (missing) {
    return (
      <div className="song-page">
        <a className="back" href="#/my-songs">
          My songs
        </a>
        <h1>That song isn’t on this device</h1>
      </div>
    );
  }
  if (!initial) {
    return (
      <div className="song-page">
        <a className="back" href="#/my-songs">
          My songs
        </a>
        <p className="loading-tune">Loading your song…</p>
      </div>
    );
  }
  return <EditorSession key={`${props.songId}:${initial.id}`} {...props} initial={initial} />;
}

function EditorSession({ songId, store, taken, noteSize, onNoteSize, followScroll, onFollowScroll, initial }: Props & { initial: EditorState }) {
  const [state, dispatch] = useStateReducer(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);
  const [countIn, setCountIn] = useState(false);
  const [grid, setGrid] = useState(0.5);
  const recordStop = useRef<(() => void) | null>(null);
  const recordBuffer = useRef<Float32Array>(new Float32Array(0));
  const recordCount = useRef(0);
  const recordCancel = useRef(false);
  const analyzed = useRef(0);
  const [bpm, setBpm] = useState(initial.tempo);
  const [speed, setSpeed] = useState(1);
  const detectOptions = useRef({ drum: state.drum, bpm, grid });
  detectOptions.current = { drum: state.drum, bpm, grid };
  const [manualPlaying, setManualPlaying] = useState(false);
  const [guide, setGuide] = useState<number | null>(null);
  const followedLine = useRef(-1);

  useEffect(() => {
    document.title = `${state.title.trim() || "Untitled"} · My Songs`;
  }, [state.title]);

  const parsed = useMemo(() => {
    try {
      return {
        lines: state.lines.map((line) => ({
          lyric: line.lyric.trim() || undefined,
          notes: line.notes.map((note) => parseNote(note)),
        })),
        error: null as string | null,
      };
    } catch (error) {
      return {
        lines: [] as { lyric?: string; notes: NoteEvent[] }[],
        error: error instanceof Error ? error.message : "Could not read these notes",
      };
    }
  }, [state.lines]);

  const events = useMemo(() => flattenLines(parsed.lines), [parsed.lines]);
  const laid = useMemo(
    () => (parsed.error ? [] : layoutNotation(parsed.lines, state.timeSignature)),
    [parsed, state.timeSignature],
  );
  const midiFor = useCallback(
    (event: PlayEvent) => {
      if (event.rest || event.deg == null || event.oct == null) return null;
      if (state.lines[event.lineIndex]?.notes[event.noteIndex]?.uncertain) return null;
      if (!layoutById(DRUM_LAYOUT[state.drum]).tongues.some((tongue) => tongue.deg === event.deg && tongue.oct === event.oct)) {
        return null;
      }
      return noteMidi(state.drum, event.deg, event.oct);
    },
    [state.drum, state.lines],
  );
  const player = usePlayer(events, bpm, midiFor);
  const active = player.index >= 0 ? events[player.index] : undefined;
  const markedLine = player.playing || guide == null ? (active?.lineIndex ?? -1) : guide;
  const other = useMemo(() => generateArrangement(otherDrum(state.drum), state.lines), [state.drum, state.lines]);
  const uncertain = useMemo(() => {
    const marks = new Set<string>();
    state.lines.forEach((line, lineIndex) => {
      line.notes.forEach((note, noteIndex) => {
        if (note.uncertain) marks.add(`${lineIndex}:${noteIndex}`);
      });
    });
    return marks;
  }, [state.lines]);
  const tongues = useMemo(
    () => [...layoutById(DRUM_LAYOUT[state.drum]).tongues].sort(pitchCompare),
    [state.drum],
  );
  const selected = state.selection ? state.lines[state.selection.line]?.notes[state.selection.note] : undefined;
  const selectedTongue: Tongue | null =
    selected && selected.rest !== true && selected.deg != null && selected.oct != null
      ? { deg: selected.deg, oct: selected.oct }
      : null;
  const playingTongue: Tongue | null =
    active && !active.rest && active.deg != null && active.oct != null ? { deg: active.deg, oct: active.oct } : null;

  const revealLine = useCallback((lineIndex: number, preferNote: boolean) => {
    const line = document.querySelector(`[data-line="${lineIndex}"]`);
    if (!(line instanceof HTMLElement)) return;
    const chrome = chromeInsets();
    const note = line.querySelector(".note.is-active");
    const lineRect = line.getBoundingClientRect();
    const room = window.innerHeight - chrome.top - chrome.bottom;
    const focus = preferNote && note instanceof HTMLElement && lineRect.height > room ? note : line;
    const top = scrollTopFor(focus.getBoundingClientRect().top, window.scrollY, window.innerHeight, chrome.top, chrome.bottom);
    if (Math.abs(top - window.scrollY) < 12) return;
    window.scrollTo({ top, behavior: scrollBehavior() });
  }, []);

  const clearGuide = useCallback(() => {
    setManualPlaying(false);
    setGuide(null);
  }, []);

  useEffect(() => {
    if (!player.playing) return;
    setManualPlaying(false);
    setGuide(null);
  }, [player.playing]);

  useEffect(() => {
    if (!player.playing || !followScroll) return;
    const lineIndex = active?.lineIndex ?? -1;
    if (lineIndex < 0) return;
    const note = document.querySelector(".note.is-active");
    const rect = note instanceof HTMLElement ? note.getBoundingClientRect() : null;
    const chrome = chromeInsets();
    const hidden = !rect || !noteFitsViewport(rect.top, rect.bottom, window.innerHeight, chrome.top, chrome.bottom);
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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const inField = Boolean(target?.closest("input, textarea, select"));
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch(event.shiftKey ? { type: "redo" } : { type: "undo" });
        return;
      }
      if (inField) return;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        clearGuide();
        player.step(1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        clearGuide();
        player.step(-1);
      } else if (event.key === " ") {
        if (target?.closest("button, a")) return;
        event.preventDefault();
        player.toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player, clearGuide]);

  const averageBeats = useMemo(() => {
    if (!laid.length) return beatsPerBar(state.timeSignature);
    const total = laid.reduce((sum, line) => sum + lineBeats(line), 0);
    return total / laid.length || beatsPerBar(state.timeSignature);
  }, [laid, state.timeSignature]);

  useEffect(() => () => recordStop.current?.(), []);

  function applyDetected(notes: DetectedNote[]) {
    if (notes.length <= recordCount.current) return;
    const start = recordCount.current;
    const previousDur = start > 0 ? notes[start - 1].dur : undefined;
    for (let index = start; index < notes.length; index += 1) {
      const note = notes[index];
      dispatch({
        type: "appendDetected",
        deg: note.deg,
        oct: note.oct,
        dur: note.dur,
        uncertain: note.uncertain,
        previousDur: index === start ? previousDur : undefined,
      });
    }
    recordCount.current = notes.length;
  }

  function stopRecording() {
    recordCancel.current = true;
    recordStop.current?.();
    recordStop.current = null;
    if (!recordStop.current) endRecordingAudio();
    setRecording(false);
  }

  async function startRecording() {
    setRecordError(null);
    recordCancel.current = false;
    setRecording(true);
    player.pause();
    setManualPlaying(false);
    if (countIn) {
      unlockAudio();
      for (let beat = 0; beat < 4; beat += 1) {
        if (recordCancel.current) {
          setRecording(false);
          return;
        }
        playClick();
        await new Promise((resolve) => window.setTimeout(resolve, 60000 / Math.max(40, bpm)));
      }
    }
    if (recordCancel.current) {
      setRecording(false);
      return;
    }
    recordingSession();
    let stream: MediaStream;
    try {
      stream = await openMicrophone();
    } catch (error) {
      endRecordingAudio();
      setRecording(false);
      setRecordError(describeMicError(error));
      return;
    }
    if (recordCancel.current) {
      for (const track of stream.getTracks()) track.stop();
      endRecordingAudio();
      setRecording(false);
      return;
    }
    recordBuffer.current = new Float32Array(0);
    recordCount.current = 0;
    analyzed.current = 0;
    recordStop.current = listenToMicrophone(stream, (chunk, sampleRate) => {
      const current = recordBuffer.current;
      const next = new Float32Array(current.length + chunk.length);
      next.set(current);
      next.set(chunk, current.length);
      recordBuffer.current = next;
      if (next.length - analyzed.current < sampleRate * 0.08) return;
      analyzed.current = next.length;
      applyDetected(detectNotes(next, sampleRate, detectOptions.current));
    });
  }

  async function validatedSong(): Promise<{ song: SongFile } | { error: string }> {
    const claimed = new Set(taken);
    claimed.delete(state.id);
    const id = songId === "new" ? allocateId(`my-${slugifyTitle(state.title)}`, claimed) : state.id;
    const built = buildPersonalSong({ ...state, tempo: state.tempo }, id);
    if ("error" in built) return { error: built.error };
    const failures = await issuesForPersonalSong(built.song);
    if (failures.length > 0) return { error: failures.map((failure) => `${failure.field}: ${failure.error}`).join(" ") };
    return { song: built.song };
  }

  async function save() {
    setNotice(null);
    const result = await validatedSong();
    if (!("song" in result)) {
      setErrors([result.error]);
      return;
    }
    await store.put({ updatedAt: new Date().toISOString(), song: result.song });
    setErrors([]);
    setNotice("Saved on this device.");
    if (songId === "new") window.location.hash = `#/my-songs/${result.song.id}`;
  }

  async function exportThis() {
    setNotice(null);
    const result = await validatedSong();
    if (!("song" in result)) {
      setErrors([result.error]);
      return;
    }
    setErrors([]);
    downloadJson(`${result.song.id}.json`, exportSongs([result.song]));
  }

  function playTongueNow(tongue: Tongue) {
    try {
      unlockAudio();
      playTongue(noteMidi(state.drum, tongue.deg, tongue.oct));
    } catch {
      // The note is still written if audio is blocked.
    }
    dispatch({ type: "appendTongue", deg: tongue.deg, oct: tongue.oct });
  }

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

  const otherDrumName = otherDrum(state.drum);
  const canUse = (drum: DrumKey) => drum === state.drum || other.status !== "unavailable";

  return (
    <div className={`song-page notes-${noteSize}`}>
      <a className="back" href="#/my-songs">
        My songs
      </a>
      <header className="song-head">
        <p className="kicker">On this device only</p>
        <h1>
          <label className="title-edit">
            <span className="sr-only">Title</span>
            <input
              value={state.title}
              onChange={(event) => dispatch({ type: "setTitle", title: event.target.value })}
              aria-label="Title"
            />
          </label>
        </h1>
        <p className="meter-help">Nothing is uploaded. Songs stay in this browser.</p>
      </header>

      <div className="editor-fields">
        <label>
          Tempo
          <input
            type="number"
            min={40}
            max={240}
            step={1}
            value={state.tempo}
            onChange={(event) => dispatch({ type: "setTempo", tempo: Number(event.target.value) })}
          />
          <span>quarter BPM</span>
        </label>
        <label>
          Time
          <select
            value={state.timeSignature}
            onChange={(event) => dispatch({ type: "setTimeSignature", timeSignature: event.target.value as TimeSignature })}
          >
            {METERS.map((meter) => (
              <option key={meter} value={meter}>
                {meter}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="pills">
          <legend>This song’s drum</legend>
          {(["C", "D"] as const).map((drum) => (
            <label key={drum} className={state.drum === drum ? "is-selected" : ""}>
              <input
                type="radio"
                name="song-drum"
                value={drum}
                checked={state.drum === drum}
                disabled={!canUse(drum)}
                onChange={() => dispatch({ type: "setDrum", drum })}
              />
              {drum} · {DRUM_LAYOUT[drum]} notes
            </label>
          ))}
        </fieldset>
      </div>
      <p className="meter-help">{meterHelp(state.timeSignature)}</p>
      <p className="bar-status">{barStatus(state.lines, state.timeSignature)}</p>

      <section className={other.status === "unavailable" ? "other-key is-unavailable" : "other-key"} aria-live="polite">
        <h2>
          {otherDrumName} arrangement
        </h2>
        {other.status === "empty" ? <p>The other drum is filled in from these same degrees once you add notes. A C song always fits on the D drum.</p> : null}
        {other.status === "ready" ? (
          <p>
            Same degrees and octaves. Smallest drum for {otherDrumName}: {other.minLayout} notes.
          </p>
        ) : null}
        {other.status === "unavailable" ? (
          <p>
            Unavailable. These notes are not on the {DRUM_LAYOUT[otherDrumName]}-note {otherDrumName} drum:{" "}
            {other.outOfRange.map(tongueLabel).join(", ")}. They are listed instead of being saved.
          </p>
        ) : null}
      </section>

      <section className="record-panel" aria-labelledby="record-heading">
        <h2 id="record-heading">Record</h2>
        <p>Recording stays on this device. The microphone audio is not uploaded.</p>
        <label className="count-in">
          <input type="checkbox" checked={countIn} onChange={(event) => setCountIn(event.target.checked)} disabled={recording} />
          Count-in
        </label>
        <label>
          Grid
          <select value={grid} disabled={recording} onChange={(event) => setGrid(Number(event.target.value))}>
            <option value={0.25}>16th notes</option>
            <option value={0.5}>Eighth notes</option>
            <option value={1}>Quarter notes</option>
          </select>
        </label>
        <button type="button" aria-pressed={recording} onClick={() => (recording ? stopRecording() : void startRecording())}>
          {recording ? "Stop" : "Record"}
        </button>
        {recording ? <p className="listening">Listening… notes show up as they are heard.</p> : null}
        {recordError ? (
          <p className="banner" role="alert">
            {recordError}
          </p>
        ) : null}
      </section>

      {errors.length > 0 ? (
        <div className="banner" role="alert">
          {errors.join(" ")}
        </div>
      ) : null}
      {notice ? <p className="save-notice">{notice}</p> : null}
      {parsed.error ? (
        <div className="banner" role="alert">
          {parsed.error}
        </div>
      ) : null}

      <div className="editor-actions">
        <button type="button" onClick={() => dispatch({ type: "undo" })} disabled={state.past.length === 0}>
          Undo
        </button>
        <button type="button" onClick={() => dispatch({ type: "redo" })} disabled={state.future.length === 0}>
          Redo
        </button>
        <button type="button" onClick={() => void save()}>
          Save
        </button>
        <button type="button" onClick={() => void exportThis()}>
          Export
        </button>
      </div>

      <div className="practice-grid">
        <section className="panel notation-panel" aria-labelledby="notation-heading">
          <div className="panel-head">
            <h2 id="notation-heading">Notation</h2>
            <p>Tap a tongue to append a note. Select a note to change it.</p>
          </div>
          <div className="editor-tools">
            <fieldset className="pills">
              <legend>Duration</legend>
              {DURATIONS.map((item) => (
                <label key={item.dur} className={state.duration === item.dur ? "is-selected" : ""}>
                  <input
                    type="radio"
                    name="duration"
                    value={item.dur}
                    checked={state.duration === item.dur}
                    onChange={() => dispatch({ type: "setDuration", duration: item.dur })}
                  />
                  {item.label}
                </label>
              ))}
            </fieldset>
            <div className="editor-actions">
              <button type="button" onClick={() => dispatch({ type: "insertNote" })}>
                Insert note
              </button>
              <button type="button" onClick={() => dispatch({ type: "insertRest" })}>
                Insert rest
              </button>
              <button type="button" onClick={() => dispatch({ type: "deleteNote" })} disabled={!state.selection}>
                Delete
              </button>
              <button type="button" onClick={() => dispatch({ type: "splitLine" })} disabled={!state.selection || state.selection.note === 0}>
                Split line
              </button>
              <button type="button" onClick={() => dispatch({ type: "mergeLine" })} disabled={state.lines.length < 2}>
                Merge lines
              </button>
              <button type="button" onClick={() => dispatch({ type: "toggleRest" })} disabled={!state.selection}>
                {selected?.rest === true ? "Make note" : "Make rest"}
              </button>
            </div>
            <fieldset className="pills tongue-picker">
              <legend>Selected note</legend>
              {tongues.map((tongue) => {
                const on = selectedTongue?.deg === tongue.deg && selectedTongue.oct === tongue.oct;
                return (
                  <label key={`${tongue.deg}:${tongue.oct}`} className={on ? "is-selected" : ""}>
                    <input
                      type="radio"
                      name="selected-tongue"
                      checked={on}
                      disabled={!state.selection}
                      onChange={() => dispatch({ type: "setTongue", deg: tongue.deg, oct: tongue.oct })}
                    />
                    {tongueLabel(tongue)}
                  </label>
                );
              })}
            </fieldset>
          </div>
          <ol className="lyric-editor">
            {state.lines.map((line, index) => (
              <li key={index}>
                <label>
                  Line {index + 1} lyric
                  <input
                    value={line.lyric}
                    onChange={(event) => dispatch({ type: "setLyric", line: index, lyric: event.target.value })}
                  />
                </label>
              </li>
            ))}
          </ol>
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
          {parsed.error ? null : (
            <Notation
              lines={laid}
              timeSignature={state.timeSignature}
              drumKey={state.drum}
              activeLine={active?.lineIndex ?? -1}
              activeNote={active?.noteIndex ?? -1}
              pickedLine={state.selection?.line ?? -1}
              pickedNote={state.selection?.note ?? -1}
              uncertain={uncertain}
              markedLine={markedLine}
              missing={new Set()}
              onSelect={(lineIndex, noteIndex) => {
                clearGuide();
                dispatch({ type: "select", line: lineIndex, note: noteIndex });
                const index = eventIndex(events, lineIndex, noteIndex);
                if (index >= 0) player.jumpTo(index);
              }}
            />
          )}
        </section>

        <section className="panel diagram-panel">
          <h2 className="sr-only">Drum</h2>
          <DrumDiagram
            layoutId={DRUM_LAYOUT[state.drum]}
            drumKey={state.drum}
            active={player.playing ? playingTongue : selectedTongue ?? playingTongue}
            onTongue={playTongueNow}
          />
          <div className="editor-actions">
            <button type="button" onClick={() => dispatch({ type: "appendRest" })}>
              Add rest
            </button>
          </div>
          <p className="diagram-caption">
            {state.drum} major, {DRUM_LAYOUT[state.drum]} notes. Tap a tongue to append a {DURATIONS.find((item) => item.dur === state.duration)?.label.toLowerCase() ?? "note"}.
          </p>
        </section>
      </div>

      <PlayerBar
        index={player.index}
        total={events.length}
        playing={player.playing}
        bpm={bpm}
        songBpm={state.tempo}
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
    </div>
  );
}

function useStateReducer(initial: EditorState): [EditorState, (action: Parameters<typeof editorReducer>[1]) => void] {
  const [state, setState] = useState(initial);
  const dispatch = useCallback((action: Parameters<typeof editorReducer>[1]) => {
    setState((current) => editorReducer(current, action));
  }, []);
  return [state, dispatch];
}
