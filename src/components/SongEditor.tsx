import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DRUM_LAYOUT, generateArrangement, otherDrum, tongueLabel } from "../lib/arrangements";
import { endRecordingAudio, playClick, playTongue, unlockAudio } from "../lib/audio";
import { detectNotes, measureNoise, type DetectedNote, type NoiseProfile, type RecordSensitivity } from "../lib/detect";
import { barsInUse, createEditor, editorReducer, selectedNotes, type EditorLine, type EditorState } from "../lib/editor";
import { parseNotationText, serializeNotation } from "../lib/notationText";
import { describeMicError, listenToMicrophone, openMicrophone, recordingSession } from "../lib/microphone";
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

const METERS: TimeSignature[] = ["4/4", "3/4", "2/4", "2/2", "3/2", "4/2", "6/4", "6/8", "9/8", "12/8"];

type Props = {
  songId: string;
  store: SongStore;
  taken: Set<string>;
  noteSize: NoteSize;
  onNoteSize: (size: NoteSize) => void;
  followScroll: boolean;
  onFollowScroll: (value: boolean) => void;
  recordSensitivity: RecordSensitivity;
  onRecordSensitivity: (value: RecordSensitivity) => void;
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
    props.store.getDraft(props.songId).then(async (draft) => {
      if (!live) return;
      if (draft) {
        setInitial(
          createEditor({
            id: draft.id,
            title: draft.title,
            tempo: draft.tempo,
            timeSignature: draft.timeSignature,
            drum: draft.drum,
            lines: draft.lines,
            duration: draft.duration,
            dotted: draft.dotted,
            barsPerLine: draft.barsPerLine,
          }),
        );
        return;
      }
      const record = await props.store.get(props.songId);
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

function chunkRms(chunk: Float32Array): number {
  let sum = 0;
  for (let index = 0; index < chunk.length; index += 1) sum += chunk[index] * chunk[index];
  return Math.sqrt(sum / Math.max(1, chunk.length));
}

function meterPercent(rms: number): number {
  const db = 20 * Math.log10(Math.max(rms, 1e-6));
  return Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
}

function EditorSession({
  songId,
  store,
  taken,
  noteSize,
  onNoteSize,
  followScroll,
  onFollowScroll,
  recordSensitivity,
  onRecordSensitivity,
  initial,
}: Props & { initial: EditorState }) {
  const [state, dispatch] = useStateReducer(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordPhase, setRecordPhase] = useState<"idle" | "measuring" | "listening">("idle");
  const [levels, setLevels] = useState({ input: 0, floor: 0 });
  const [recordError, setRecordError] = useState<string | null>(null);
  const [countIn, setCountIn] = useState(false);
  const [grid, setGrid] = useState(0.5);
  const [metronome, setMetronome] = useState(false);
  const [loopSelection, setLoopSelection] = useState(false);
  const [clipboard, setClipboard] = useState<EditorLine["notes"]>([]);
  const [typed, setTyped] = useState("");
  const [typeError, setTypeError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showSheet, setShowSheet] = useState(false);
  const [saveState, setSaveState] = useState<"Saved" | "Unsaved" | "Saving">("Saved");
  const typing = useRef(false);
  const skipSave = useRef(true);
  const recordStop = useRef<(() => void) | null>(null);
  const recordBuffer = useRef<Float32Array>(new Float32Array(0));
  const recordCount = useRef(0);
  const recordCancel = useRef(false);
  const analyzed = useRef(0);
  const [bpm, setBpm] = useState(initial.tempo);
  const [speed, setSpeed] = useState(1);
  const noiseProfile = useRef<NoiseProfile | null>(null);
  const levelStamp = useRef(0);
  const detectOptions = useRef({ drum: state.drum, bpm, grid, sensitivity: recordSensitivity });
  detectOptions.current = { drum: state.drum, bpm, grid, sensitivity: recordSensitivity };
  const [manualPlaying, setManualPlaying] = useState(false);
  const [guide, setGuide] = useState<number | null>(null);
  const followedLine = useRef(-1);

  useEffect(() => {
    document.title = `${state.title.trim() || "Untitled song"} · My Songs`;
  }, [state.title]);

  useEffect(() => {
    if (typing.current) return;
    setTyped(serializeNotation(state.lines, state.timeSignature));
  }, [state.lines, state.timeSignature]);

  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    setSaveState("Unsaved");
    const timer = window.setTimeout(() => {
      setSaveState("Saving");
      const draft = {
        id: state.id,
        updatedAt: new Date().toISOString(),
        title: state.title.trim() || "Untitled song",
        tempo: state.tempo,
        timeSignature: state.timeSignature,
        drum: state.drum,
        lines: state.lines,
        duration: state.duration,
        dotted: state.dotted,
        barsPerLine: state.barsPerLine,
      };
      void store.putDraft(draft).then(() => setSaveState("Saved"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [state.lines, state.title, state.tempo, state.timeSignature, state.drum, state.duration, state.dotted, state.barsPerLine, store, state.id]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (saveState === "Unsaved" || saveState === "Saving") {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saveState]);

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
  const loop = useMemo(() => {
    if (!loopSelection || !state.selection) return null;
    const end = state.rangeEnd ?? state.selection;
    const startIndex = eventIndex(events, state.selection.line, state.selection.note);
    const endIndex = eventIndex(events, end.line, end.note);
    if (startIndex < 0 || endIndex < 0) return null;
    return { start: Math.min(startIndex, endIndex), end: Math.max(startIndex, endIndex) };
  }, [loopSelection, state.selection, state.rangeEnd, events]);
  const player = usePlayer(events, bpm, midiFor, loop);
  useEffect(() => {
    if (!metronome || !player.playing) return;
    const timer = window.setInterval(() => playClick(), (60 / Math.max(40, bpm)) * 1000);
    return () => window.clearInterval(timer);
  }, [metronome, player.playing, bpm]);
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

  const countInBeats = useCallback(async () => {
    if (!countIn) return;
    unlockAudio();
    const beats = Math.max(1, beatsPerBar(state.timeSignature));
    for (let beat = 0; beat < beats; beat += 1) {
      playClick();
      await new Promise((resolve) => window.setTimeout(resolve, 60000 / Math.max(40, bpm)));
    }
  }, [countIn, state.timeSignature, bpm]);

  const togglePlayback = useCallback(async () => {
    if (player.playing) {
      player.pause();
      return;
    }
    await countInBeats();
    player.play();
  }, [player, countInBeats]);

  const playFromHere = useCallback(async () => {
    player.pause();
    await countInBeats();
    const anchor = state.rangeEnd && state.selection
      ? state.selection.line < state.rangeEnd.line || (state.selection.line === state.rangeEnd.line && state.selection.note <= state.rangeEnd.note)
        ? state.selection
        : state.rangeEnd
      : state.selection;
    if (anchor) {
      const index = eventIndex(events, anchor.line, anchor.note);
      if (index >= 0) player.playFrom(index);
      return;
    }
    const line = state.lines[state.caret.line];
    const note = line && state.caret.index < line.notes.length ? state.caret.index : Math.max(0, (line?.notes.length ?? 1) - 1);
    const index = eventIndex(events, state.caret.line, note);
    if (index >= 0) player.playFrom(index);
  }, [player, countInBeats, state.rangeEnd, state.selection, state.caret, state.lines, events]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const inField = Boolean(target?.closest("input, textarea, select"));
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        dispatch(event.shiftKey ? { type: "redo" } : { type: "undo" });
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void save();
        return;
      }
      if (inField) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && state.selection) {
        event.preventDefault();
        setClipboard(selectedNotes(state));
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v" && clipboard.length > 0) {
        event.preventDefault();
        dispatch({ type: "paste", notes: clipboard });
        return;
      }
      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        event.preventDefault();
        setShowHelp((open) => !open);
        return;
      }
      const digit = Number(event.key);
      if (event.key >= "1" && event.key <= "7" && !inField) {
        event.preventDefault();
        const oct = event.shiftKey ? 1 : event.altKey ? -1 : 0;
        playDegree(digit, oct);
        return;
      }
      if ((event.key === "0" || event.key.toLowerCase() === "r") && !inField) {
        event.preventDefault();
        dispatch({ type: "paste", notes: [{ rest: true, dur: state.dotted ? state.duration * 1.5 : state.duration }] });
        return;
      }
      if (event.altKey && event.key >= "1" && event.key <= "5" && !inField) {
        event.preventDefault();
        dispatch({ type: "setDuration", duration: [4, 2, 1, 0.5, 0.25][Number(event.key) - 1] });
        return;
      }
      if (event.key === "ArrowRight" && !inField) {
        event.preventDefault();
        dispatch({ type: "moveBy", delta: 1 });
        return;
      }
      if (event.key === "ArrowLeft" && !inField) {
        event.preventDefault();
        dispatch({ type: "moveBy", delta: -1 });
        return;
      }
      if ((event.key === "Backspace" || event.key === "Delete") && !inField) {
        event.preventDefault();
        dispatch({ type: event.key === "Backspace" ? "deleteBackward" : "deleteForward" });
        return;
      }
      if (event.key === "ArrowDown" && !inField) {
        event.preventDefault();
        clearGuide();
        player.step(1);
      } else if (event.key === "ArrowUp" && !inField) {
        event.preventDefault();
        clearGuide();
        player.step(-1);
      } else if (event.key === " ") {
        if (target?.closest("button, a")) return;
        event.preventDefault();
        void togglePlayback();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [player, clearGuide, state, dispatch, clipboard, togglePlayback]);

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

  function rememberLevel(input: number, floor: number) {
    const now = performance.now();
    if (now - levelStamp.current < 50) return;
    levelStamp.current = now;
    setLevels({ input, floor });
  }

  function stopRecording() {
    recordCancel.current = true;
    recordStop.current?.();
    recordStop.current = null;
    if (!recordStop.current) endRecordingAudio();
    setRecording(false);
    setRecordPhase("idle");
  }

  async function startRecording() {
    setRecordError(null);
    recordCancel.current = false;
    setRecording(true);
    setRecordPhase("measuring");
    player.pause();
    setManualPlaying(false);
    recordingSession();
    let stream: MediaStream;
    try {
      stream = await openMicrophone();
    } catch (error) {
      endRecordingAudio();
      setRecording(false);
      setRecordPhase("idle");
      setRecordError(describeMicError(error));
      return;
    }
    if (recordCancel.current) {
      for (const track of stream.getTracks()) track.stop();
      endRecordingAudio();
      setRecording(false);
      setRecordPhase("idle");
      return;
    }
    const calibration = await new Promise<{ samples: Float32Array; sampleRate: number }>((resolve) => {
      const chunks: Float32Array[] = [];
      let sampleRate = 44100;
      let count = 0;
      const stop = listenToMicrophone(
        stream,
        (chunk, rate) => {
          sampleRate = rate;
          chunks.push(chunk);
          count += chunk.length;
          rememberLevel(chunkRms(chunk), chunkRms(chunk));
          if (count >= rate || recordCancel.current) {
            stop();
            const samples = new Float32Array(count);
            let offset = 0;
            for (const piece of chunks) {
              samples.set(piece, offset);
              offset += piece.length;
            }
            resolve({ samples, sampleRate });
          }
        },
        { stopTracks: false },
      );
      recordStop.current = () => {
        stop();
        for (const track of stream.getTracks()) track.stop();
      };
    });
    recordStop.current = null;
    if (recordCancel.current) {
      for (const track of stream.getTracks()) track.stop();
      endRecordingAudio();
      setRecording(false);
      setRecordPhase("idle");
      return;
    }
    noiseProfile.current = measureNoise(calibration.samples, calibration.sampleRate);
    if (countIn) {
      unlockAudio();
      for (let beat = 0; beat < 4; beat += 1) {
        if (recordCancel.current) {
          for (const track of stream.getTracks()) track.stop();
          endRecordingAudio();
          setRecording(false);
          setRecordPhase("idle");
          return;
        }
        playClick();
        await new Promise((resolve) => window.setTimeout(resolve, 60000 / Math.max(40, bpm)));
      }
    }
    if (recordCancel.current) {
      for (const track of stream.getTracks()) track.stop();
      endRecordingAudio();
      setRecording(false);
      setRecordPhase("idle");
      return;
    }
    recordBuffer.current = new Float32Array(0);
    recordCount.current = 0;
    analyzed.current = 0;
    setRecordPhase("listening");
    recordStop.current = listenToMicrophone(stream, (chunk, sampleRate) => {
      rememberLevel(chunkRms(chunk), noiseProfile.current?.rms ?? 0);
      const current = recordBuffer.current;
      const next = new Float32Array(current.length + chunk.length);
      next.set(current);
      next.set(chunk, current.length);
      recordBuffer.current = next;
      if (next.length - analyzed.current < sampleRate * 0.08) return;
      analyzed.current = next.length;
      const profile = noiseProfile.current ?? undefined;
      applyDetected(detectNotes(next, sampleRate, { ...detectOptions.current, noise: profile }));
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

  function playDegree(deg: number, oct: number) {
    try {
      unlockAudio();
      playTongue(noteMidi(state.drum, deg, oct));
    } catch {
      // Still enter the note if audio is blocked.
    }
    dispatch({ type: "strike", deg, oct });
  }

  function playTongueNow(tongue: Tongue) {
    try {
      unlockAudio();
      playTongue(noteMidi(state.drum, tongue.deg, tongue.oct));
    } catch {
      // The note is still written if audio is blocked.
    }
    dispatch({ type: "strike", deg: tongue.deg, oct: tongue.oct });
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
        <label>
          Sensitivity
          <select
            value={recordSensitivity}
            disabled={recording}
            onChange={(event) => onRecordSensitivity(event.target.value as RecordSensitivity)}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </label>
        <button type="button" aria-pressed={recording} onClick={() => (recording ? stopRecording() : void startRecording())}>
          {recording ? "Stop" : "Record"}
        </button>
        {recording ? (
          <div className="input-meter" aria-label="Input level">
            <span style={{ width: `${meterPercent(levels.input)}%` }} />
            <i style={{ left: `${meterPercent(levels.floor)}%` }} />
          </div>
        ) : null}
        {recordPhase === "measuring" ? <p className="listening">Measuring room noise… stay quiet</p> : null}
        {recordPhase === "listening" ? <p className="listening">Listening… notes show up as they are heard.</p> : null}
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
        <button type="button" onClick={() => void save()}>
          Save
        </button>
        <button type="button" onClick={() => void exportThis()}>
          Export
        </button>
      </div>

      <p className="save-state" role="status">{saveState}{state.lines.every((line) => line.notes.length === 0) ? ". Tap the drum to add a note." : ""}</p>
      <div className="editor-stage">
        <section className="panel notation-panel" aria-labelledby="notation-heading">
          <div className="panel-head">
            <h2 id="notation-heading">Notation</h2>
            <p>Tap the drum. The caret shows where the next note goes.</p>
          </div>
          <label className="type-notes">
            Type notes
            <textarea
              value={typed}
              spellCheck={false}
              aria-invalid={typeError != null}
              aria-describedby="type-help"
              onFocus={() => { typing.current = true; }}
              onBlur={() => { typing.current = false; }}
              onChange={(event) => {
                const value = event.target.value;
                setTyped(value);
                typing.current = true;
                const parsedText = parseNotationText(value, state.drum);
                if ("error" in parsedText) {
                  setTypeError(`${parsedText.error.message} (character ${parsedText.error.index + 1})`);
                  return;
                }
                setTypeError(parsedText.warnings[0] ? `${parsedText.warnings[0].message} (character ${parsedText.warnings[0].index + 1})` : null);
                const withLyrics = parsedText.lines.map((line, index) => ({ ...line, lyric: state.lines[index]?.lyric ?? "" }));
                dispatch({ type: "replaceLines", lines: withLyrics });
              }}
            />
          </label>
          <p id="type-help">
            1–7 are degrees and 0 is a rest. An apostrophe marks the high octave and a comma marks the low octave. _ is an eighth, = is a 16th, - adds a beat, and . dots the note. Spaces separate notes, | is a bar, and a new line starts a line.
            <button type="button" className="text-button" onClick={() => setShowSheet((open) => !open)}>Cheat sheet</button>
          </p>
          {typeError ? <p className="banner" role="alert">{typeError}</p> : null}
          {showSheet ? (
            <div className="cheat-sheet" role="dialog" aria-label="Notation cheat sheet">
              <p>1 2 3 quarter notes. 1' high 1. 5, low 5. 1_ eighth. 1= sixteenth. 1- half. 1. dotted quarter. 0 rest. | bar line.</p>
            </div>
          ) : null}
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
            <>
            <p className="sr-only" aria-live="polite">
              {state.selection
                ? `Selected note ${state.selection.note + 1} on line ${state.selection.line + 1}`
                : `Caret on line ${state.caret.line + 1}, before note ${state.caret.index + 1}`}
              . {saveState}.
            </p>
            <Notation
              lines={laid}
              timeSignature={state.timeSignature}
              drumKey={state.drum}
              activeLine={active?.lineIndex ?? -1}
              activeNote={active?.noteIndex ?? -1}
              pickedLine={state.selection?.line ?? -1}
              pickedNote={state.selection?.note ?? -1}
              caretLine={state.caret.line}
              caretIndex={state.caret.index}
              rangeStart={state.rangeEnd ? state.selection : null}
              rangeEnd={state.rangeEnd}
              lyrics={state.lines.map((line) => line.lyric)}
              onLyric={(lineIndex, lyric) => dispatch({ type: "setLyric", line: lineIndex, lyric })}
              showBarFill
              uncertain={uncertain}
              markedLine={markedLine}
              missing={new Set()}
              onSelect={(lineIndex, noteIndex, shiftKey) => {
                clearGuide();
                if (shiftKey) dispatch({ type: "selectRange", line: lineIndex, note: noteIndex });
                else dispatch({ type: "select", line: lineIndex, note: noteIndex });
                const index = eventIndex(events, lineIndex, noteIndex);
                if (index >= 0 && !shiftKey) {
                  const event = events[index];
                  if (event && !event.rest && event.deg != null && event.oct != null) {
                    try {
                      unlockAudio();
                      playTongue(noteMidi(state.drum, event.deg, event.oct));
                    } catch {
                      // Preview is optional.
                    }
                  }
                  player.jumpTo(index);
                }
              }}
            />
            </>
          )}
        </section>

        <section className="panel diagram-panel editor-dock">
          <h2 className="sr-only">Drum</h2>
          <div className="dock-drum">
            <DrumDiagram
              layoutId={DRUM_LAYOUT[state.drum]}
              drumKey={state.drum}
              active={player.playing ? playingTongue : selectedTongue ?? playingTongue}
              onTongue={playTongueNow}
            />
            <p className="diagram-caption">
              Tap a tongue to write a note at the caret. With a note selected, the next tap replaces it and moves on.
            </p>
          </div>
          <div className="entry-toolbar" role="toolbar" aria-label="Note entry">
            <div className="duration-bar">
              {[
                [4, "Whole"],
                [2, "Half"],
                [1, "Quarter"],
                [0.5, "Eighth"],
                [0.25, "16th"],
              ].map(([dur, label]) => (
                <button
                  key={label}
                  type="button"
                  className={state.duration === dur ? "is-on" : ""}
                  aria-pressed={state.duration === dur}
                  onClick={() => dispatch({ type: "setDuration", duration: Number(dur) })}
                >
                  <NoteIcon dur={Number(dur)} />
                  <span>{label}</span>
                </button>
              ))}
              <button type="button" className={state.dotted ? "is-on" : ""} aria-pressed={state.dotted} onClick={() => dispatch({ type: "setDotted", dotted: !state.dotted })}>
                <span className="dot-mark">.</span>
                <span>Dot</span>
              </button>
              <button type="button" onClick={() => dispatch({ type: "paste", notes: [{ rest: true, dur: state.dotted ? state.duration * 1.5 : state.duration }] })}>
                <span>0</span>
                <span>Rest</span>
              </button>
              <button type="button" onClick={() => dispatch({ type: "repeatLast" })}>
                <span aria-hidden="true">↩</span>
                <span>Repeat</span>
              </button>
            </div>
            <div className="edit-bar">
              <button type="button" onClick={() => dispatch({ type: "undo" })} disabled={state.past.length === 0}>Undo</button>
              <button type="button" onClick={() => dispatch({ type: "redo" })} disabled={state.future.length === 0}>Redo</button>
              <button type="button" onClick={() => { if (state.selection) setClipboard(selectedNotes(state)); }} disabled={!state.selection}>Copy</button>
              <button type="button" onClick={() => dispatch({ type: "paste", notes: clipboard })} disabled={clipboard.length === 0}>Paste</button>
              <button type="button" onClick={() => dispatch({ type: "deleteRange" })} disabled={!state.selection}>Delete</button>
              <button type="button" onClick={() => dispatch({ type: "duplicateRange" })} disabled={!state.selection}>Duplicate</button>
              <button type="button" onClick={() => dispatch({ type: "shiftRange", steps: 1 })} disabled={!state.selection}>Up</button>
              <button type="button" onClick={() => dispatch({ type: "shiftRange", steps: -1 })} disabled={!state.selection}>Down</button>
              <button type="button" onClick={() => dispatch({ type: "shiftRange", steps: 7 })} disabled={!state.selection}>Octave up</button>
              <button type="button" onClick={() => dispatch({ type: "shiftRange", steps: -7 })} disabled={!state.selection}>Octave down</button>
              <button type="button" onClick={() => dispatch({ type: "splitLine" })} disabled={!state.selection || state.selection.note === 0}>Split</button>
              <button type="button" onClick={() => dispatch({ type: "mergeLine" })} disabled={state.lines.length < 2}>Merge</button>
              <button type="button" onClick={() => dispatch({ type: "selectAll" })}>Select all</button>
              <button type="button" onClick={() => { if (window.confirm("Clear every note in this song?")) dispatch({ type: "clearAll" }); }}>Clear</button>
              <button type="button" onClick={() => setShowHelp(true)} aria-label="Keyboard shortcuts">?</button>
            </div>
          </div>
          <div className="hearing-bar">
            <button type="button" onClick={() => void playFromHere()} disabled={events.length === 0}>Play from here</button>
            <button type="button" onClick={() => {
              const found = state.lines.flatMap((line, lineIndex) => line.notes.map((note, noteIndex) => ({ note, lineIndex, noteIndex }))).find((item) => item.note.uncertain && (item.lineIndex > (state.selection?.line ?? -1) || (item.lineIndex === state.selection?.line && item.noteIndex > (state.selection?.note ?? -1))));
              const first = found ?? state.lines.flatMap((line, lineIndex) => line.notes.map((note, noteIndex) => ({ note, lineIndex, noteIndex }))).find((item) => item.note.uncertain);
              if (first) dispatch({ type: "select", line: first.lineIndex, note: first.noteIndex });
            }}>Next uncertain</button>
            <label className="count-in">
              <input type="checkbox" checked={metronome} onChange={(event) => setMetronome(event.target.checked)} />
              Metronome
            </label>
            <label className="count-in">
              <input type="checkbox" checked={loopSelection} onChange={(event) => setLoopSelection(event.target.checked)} />
              Loop selection
            </label>
            <label>
              Bars per line
              <select value={state.barsPerLine} onChange={(event) => dispatch({ type: "setBarsPerLine", bars: Number(event.target.value) })}>
                <option value={0}>Auto ({barsInUse(state)})</option>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={4}>4</option>
                <option value={8}>8</option>
              </select>
            </label>
          </div>
        </section>
      </div>
      {showHelp ? (
        <div className="shortcut-overlay" role="dialog" aria-label="Keyboard shortcuts">
          <button type="button" className="text-button" onClick={() => setShowHelp(false)}>Close</button>
          <ul>
            <li>1–7 enter a degree. Shift is high, Alt is low.</li>
            <li>0 or R enters a rest. Alt+1 through Alt+5 set the duration.</li>
            <li>Arrow keys move the caret. Backspace and Delete remove a note.</li>
            <li>Space plays and pauses. Count-in clicks a bar first when that box is checked.</li>
            <li>Cmd or Ctrl+Z undoes, Shift+Z redoes, C copies, V pastes, and S saves.</li>
          </ul>
        </div>
      ) : null}

      <PlayerBar
        index={player.index}
        total={events.length}
        playing={player.playing}
        bpm={bpm}
        songBpm={state.tempo}
        onBpm={setBpm}
        onToggle={() => void togglePlayback()}
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

function NoteIcon({ dur }: { dur: number }) {
  const glyph = dur >= 4 ? "W" : dur >= 2 ? "H" : dur >= 1 ? "Q" : dur >= 0.5 ? "E" : "S";
  return <span className="note-icon" aria-hidden="true">{glyph}</span>;
}

function useStateReducer(initial: EditorState): [EditorState, (action: Parameters<typeof editorReducer>[1]) => void] {
  const [state, setState] = useState(initial);
  const dispatch = useCallback((action: Parameters<typeof editorReducer>[1]) => {
    setState((current) => editorReducer(current, action));
  }, []);
  return [state, dispatch];
}
