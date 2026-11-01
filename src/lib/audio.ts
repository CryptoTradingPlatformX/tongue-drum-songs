let context: AudioContext | null = null;
let silentLoop: HTMLAudioElement | null = null;
let silentSrc: string | null = null;
let lifecycleBound = false;
let recording = false;
const sounding: { stop: () => void }[] = [];

/** Partials used by the preview tone. The microphone tests synthesize the same set. */
export const TONGUE_PARTIALS: { ratio: number; gain: number; type: OscillatorType }[] = [
  { ratio: 1, gain: 0.55, type: "sine" },
  { ratio: 2.003, gain: 0.2, type: "sine" },
  { ratio: 2.98, gain: 0.08, type: "sine" },
  { ratio: 4.04, gain: 0.035, type: "triangle" },
];

type AudioSessionNavigator = Navigator & {
  audioSession?: { type: string };
};

/** Unsigned 8-bit PCM silence. A real media element is what older iOS uses to leave the ringer switch. */
function silentWavUrl(): string {
  if (silentSrc) return silentSrc;
  const samples = 160;
  const bytes = new Uint8Array(44 + samples);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index);
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 8000, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, "data");
  view.setUint32(40, samples, true);
  bytes.fill(128, 44);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  silentSrc = `data:audio/wav;base64,${btoa(binary)}`;
  return silentSrc;
}

export function audioContextReady(): AudioContext {
  const ctx = audioContext();
  resumeContext(ctx);
  return ctx;
}

function audioContext(): AudioContext {
  if (!context) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) throw new Error("Web Audio is not available in this browser");
    context = new Ctx();
    bindLifecycle();
  }
  return context;
}

/**
 * iOS reports "interrupted" as well as "suspended". Resume either, and never
 * await it: the oscillators have to start in the same turn as the tap.
 */
function resumeContext(ctx: AudioContext): void {
  if (ctx.state === "running" || ctx.state === "closed") return;
  const pending = ctx.resume();
  if (pending && typeof pending.catch === "function") pending.catch(() => {});
}

function setAudioSession(type: "playback" | "play-and-record"): void {
  if (typeof navigator === "undefined") return;
  const session = (navigator as AudioSessionNavigator).audioSession;
  if (session) session.type = type;
}

function enablePlaybackSession(): void {
  setAudioSession("playback");
}

/** Stop tones that are still ringing, and keep new ones from starting while the mic is open. */
export function beginRecordingAudio(): void {
  recording = true;
  for (const node of sounding) {
    try {
      node.stop();
    } catch {
      // Already stopped.
    }
  }
  sounding.length = 0;
  setAudioSession("play-and-record");
}

export function endRecordingAudio(): void {
  recording = false;
  setAudioSession("playback");
}

function silentElement(): HTMLAudioElement {
  if (silentLoop) return silentLoop;
  const element = document.createElement("audio");
  element.setAttribute("playsinline", "");
  element.setAttribute("webkit-playsinline", "");
  (element as HTMLAudioElement & { playsInline?: boolean }).playsInline = true;
  element.loop = true;
  element.preload = "auto";
  element.src = silentWavUrl();
  element.hidden = true;
  document.body?.appendChild(element);
  silentLoop = element;
  return element;
}

function startSilentLoop(): void {
  const element = silentElement();
  if (!element.paused) return;
  const pending = element.play();
  if (pending && typeof pending.catch === "function") pending.catch(() => {});
}

function bindLifecycle(): void {
  if (lifecycleBound || typeof document === "undefined" || typeof window === "undefined") return;
  lifecycleBound = true;
  const resume = () => {
    if (!context || context.state === "running" || context.state === "closed") return;
    const pending = context.resume();
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") resume();
  });
  window.addEventListener("pageshow", resume);
}

/**
 * Call from a user gesture before the first tone. Synchronous on purpose:
 * awaiting resume() or audio.play() would leave the iOS gesture and the note would stay silent.
 * Play, step, notation taps, and drum-diagram taps all come through here.
 */
export function unlockAudio(): void {
  try {
    enablePlaybackSession();
    startSilentLoop();
    resumeContext(audioContext());
  } catch {
    // Notation still works when Web Audio is unavailable.
  }
}

/**
 * A short, bell-like tone built from a few slightly inharmonic partials.
 * Synthesized in the browser — no recorded samples.
 */
export function playClick(): void {
  if (recording) return;
  const ctx = audioContext();
  resumeContext(ctx);
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(1400, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.35, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.06);
  sounding.push(osc);
}

export function playTongue(midi: number): void {
  if (recording) return;
  const ctx = audioContext();
  resumeContext(ctx);
  const now = ctx.currentTime;
  const freq = 440 * 2 ** ((midi - 69) / 12);

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.72, now);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(Math.min(freq * 7, 6000), now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(freq * 2.2, 180), now + 0.45);
  master.connect(filter);
  filter.connect(ctx.destination);

  const partials = TONGUE_PARTIALS;
  const ring = 1.7;
  for (const partial of partials) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = partial.type;
    osc.frequency.setValueAtTime(freq * partial.ratio, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(partial.gain, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + ring);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + ring + 0.05);
    sounding.push(osc);
  }

  const clickSeconds = 0.02;
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * clickSeconds)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const envelope = 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * envelope * envelope;
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = Math.min(freq * 3, 1600);
  band.Q.value = 0.8;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.16;
  noise.connect(band);
  band.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(now);
  noise.stop(now + clickSeconds);
  sounding.push(noise);
}
