import { useCallback, useEffect, useRef, useState } from "react";
import { playTongue, unlockAudio } from "./audio";
import { quarterSeconds, type PlayEvent } from "./music";

export function usePlayer(
  events: PlayEvent[],
  bpm: number,
  midiFor: (event: PlayEvent) => number | null,
) {
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const eventsRef = useRef(events);
  const bpmRef = useRef(bpm);
  const midiRef = useRef(midiFor);
  const playingRef = useRef(false);
  const indexRef = useRef(-1);
  const timer = useRef<number | null>(null);

  eventsRef.current = events;
  bpmRef.current = bpm;
  midiRef.current = midiFor;

  const clearTimer = useCallback(() => {
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const sound = useCallback((event: PlayEvent | undefined) => {
    if (!event || event.rest) return;
    const midi = midiRef.current(event);
    if (midi == null) return;
    try {
      playTongue(midi);
    } catch {
      // The highlight still moves if the browser blocks audio.
    }
  }, []);

  const arm = useCallback(
    (nextIndex: number) => {
      clearTimer();
      const list = eventsRef.current;
      if (nextIndex < 0 || nextIndex >= list.length) {
        playingRef.current = false;
        setPlaying(false);
        return;
      }
      indexRef.current = nextIndex;
      setIndex(nextIndex);
      sound(list[nextIndex]);
      if (!playingRef.current) return;
      const ms = Math.max(1, quarterSeconds(list[nextIndex].dur, bpmRef.current) * 1000);
      timer.current = window.setTimeout(() => arm(nextIndex + 1), ms);
    },
    [clearTimer, sound],
  );

  useEffect(() => () => clearTimer(), [clearTimer]);

  useEffect(() => {
    if (indexRef.current >= events.length) {
      clearTimer();
      playingRef.current = false;
      setPlaying(false);
      const next = events.length - 1;
      indexRef.current = next;
      setIndex(next);
    }
  }, [events, clearTimer]);

  const step = useCallback(
    (delta: number) => {
      unlockAudio();
      const list = eventsRef.current;
      if (!list.length) return;
      const current = indexRef.current;
      const next = current < 0 ? 0 : Math.max(0, Math.min(list.length - 1, current + delta));
      if (playingRef.current) arm(next);
      else {
        indexRef.current = next;
        setIndex(next);
        sound(list[next]);
      }
    },
    [arm, sound],
  );

  const jumpTo = useCallback(
    (nextIndex: number) => {
      unlockAudio();
      const list = eventsRef.current;
      if (nextIndex < 0 || nextIndex >= list.length) return;
      if (playingRef.current) arm(nextIndex);
      else {
        indexRef.current = nextIndex;
        setIndex(nextIndex);
        sound(list[nextIndex]);
      }
    },
    [arm, sound],
  );

  const pause = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    clearTimer();
  }, [clearTimer]);

  const play = useCallback(() => {
    unlockAudio();
    const list = eventsRef.current;
    if (!list.length) return;
    playingRef.current = true;
    setPlaying(true);
    const current = indexRef.current;
    const atEnd = current >= list.length - 1 && current >= 0;
    arm(atEnd || current < 0 ? 0 : current);
  }, [arm]);

  const toggle = useCallback(() => {
    if (playingRef.current) pause();
    else play();
  }, [pause, play]);

  const stop = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    clearTimer();
    indexRef.current = -1;
    setIndex(-1);
  }, [clearTimer]);

  return { index, playing, step, jumpTo, toggle, pause, stop };
}
