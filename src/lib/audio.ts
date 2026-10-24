let context: AudioContext | null = null;

function audioContext(): AudioContext {
  if (!context) {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) throw new Error("Web Audio is not available in this browser");
    context = new Ctx();
  }
  return context;
}

export function unlockAudio(): void {
  try {
    const ctx = audioContext();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    // Notation still works when Web Audio is unavailable.
  }
}

/**
 * A short, bell-like tone built from a few slightly inharmonic partials.
 * Synthesized in the browser — no recorded samples.
 */
export function playTongue(midi: number): void {
  const ctx = audioContext();
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

  const partials: { ratio: number; gain: number; type: OscillatorType }[] = [
    { ratio: 1, gain: 0.55, type: "sine" },
    { ratio: 2.003, gain: 0.2, type: "sine" },
    { ratio: 2.98, gain: 0.08, type: "sine" },
    { ratio: 4.04, gain: 0.035, type: "triangle" },
  ];
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
}
