import { TONGUE_PARTIALS } from "./audio";

export type Strike = { midi: number; at: number };

function mulberry32(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function envelope(time: number, peak: number): number {
  const attack = 0.012;
  const ring = 1.7;
  if (time < 0 || time >= ring) return 0;
  if (time < attack) {
    return Math.exp(Math.log(0.0001) + (time / attack) * (Math.log(peak) - Math.log(0.0001)));
  }
  const progress = (time - attack) / (ring - attack);
  return peak * Math.pow(0.0001 / peak, progress);
}

/** Band-limited triangle, matching an oscillator at this phase. */
function triangle(phase: number): number {
  let sum = 0;
  for (let harmonic = 1, step = 0; harmonic <= 9; harmonic += 2, step += 1) {
    const sign = step % 2 === 0 ? 1 : -1;
    sum += (sign * Math.sin(harmonic * phase)) / (harmonic * harmonic);
  }
  return (sum * 8) / (Math.PI * Math.PI);
}

export type SynthExtras = {
  noise: number;
  overtones: { ratio: number; gain: number }[];
  seed: number;
};

/** The preview tone, plus the extra overtones and noise passed in. */
export function renderStrikes(strikes: Strike[], sampleRate: number, seconds: number, extras: SynthExtras): Float32Array {
  const length = Math.ceil(seconds * sampleRate);
  const samples = new Float32Array(length);
  const random = mulberry32(extras.seed);
  for (const strike of strikes) {
    const freq = 440 * 2 ** ((strike.midi - 69) / 12);
    const start = Math.floor(strike.at * sampleRate);
    const end = Math.min(length, start + Math.ceil(1.75 * sampleRate));
    for (let index = start; index < end; index += 1) {
      const time = (index - start) / sampleRate;
      let sample = 0;
      for (const partial of TONGUE_PARTIALS) {
        const phase = 2 * Math.PI * freq * partial.ratio * time;
        const wave = partial.type === "triangle" ? triangle(phase) : Math.sin(phase);
        sample += wave * envelope(time, partial.gain);
      }
      for (const overtone of extras.overtones) {
        sample += Math.sin(2 * Math.PI * freq * overtone.ratio * time) * envelope(time, overtone.gain);
      }
      if (time < 0.02) {
        const noiseEnvelope = 1 - time / 0.02;
        sample += (random() * 2 - 1) * noiseEnvelope * noiseEnvelope * extras.noise;
      } else if (time < 0.35) {
        sample += (random() * 2 - 1) * extras.noise * 0.15 * envelope(time, 1);
      }
      samples[index] += sample * 0.72;
    }
  }
  return samples;
}

export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const write = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) bytes[offset + index] = text.charCodeAt(index);
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    view.setInt16(44 + index * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return bytes;
}
