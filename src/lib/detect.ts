import { DRUM_LAYOUT } from "./arrangements";
import { layoutById, noteMidi } from "./music";
import type { DrumKey, Tongue } from "./types";

const REFRACTORY_SECONDS = 0.08;
const PITCH_START = 0.04;
const PITCH_END = 0.12;
const CENTS_LIMIT = 50;

export type DetectedNote = {
  deg: number;
  oct: number;
  dur: number;
  uncertain: boolean;
  at: number;
};

export type DetectOptions = {
  drum: DrumKey;
  bpm: number;
  /** Grid in quarter-note beats. An eighth note is 0.5. */
  grid: number;
};

function hann(length: number): Float32Array {
  const window = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    window[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (length - 1));
  }
  return window;
}

function fft(real: Float32Array, imag: Float32Array) {
  const n = real.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const realSwap = real[i];
      real[i] = real[j];
      real[j] = realSwap;
      const imagSwap = imag[i];
      imag[i] = imag[j];
      imag[j] = imagSwap;
    }
  }
  for (let length = 2; length <= n; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImag = Math.sin(angle);
    for (let start = 0; start < n; start += length) {
      let trigReal = 1;
      let trigImag = 0;
      const half = length >> 1;
      for (let index = 0; index < half; index += 1) {
        const even = start + index;
        const odd = even + half;
        const oddReal = real[odd] * trigReal - imag[odd] * trigImag;
        const oddImag = real[odd] * trigImag + imag[odd] * trigReal;
        real[odd] = real[even] - oddReal;
        imag[odd] = imag[even] - oddImag;
        real[even] += oddReal;
        imag[even] += oddImag;
        const nextReal = trigReal * stepReal - trigImag * stepImag;
        trigImag = trigReal * stepImag + trigImag * stepReal;
        trigReal = nextReal;
      }
    }
  }
}

function magnitudeSpectrum(frame: Float32Array): Float32Array {
  const n = 8192;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  const window = hann(frame.length);
  for (let index = 0; index < frame.length && index < n; index += 1) real[index] = frame[index] * window[index];
  fft(real, imag);
  const bins = n / 2;
  const mags = new Float32Array(bins);
  for (let index = 0; index < bins; index += 1) mags[index] = Math.hypot(real[index], imag[index]);
  return mags;
}

function fluxFrame(samples: Float32Array, start: number, length: number): Float32Array {
  const n = 1024;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  const window = hann(length);
  for (let index = 0; index < length; index += 1) real[index] = (samples[start + index] ?? 0) * window[index];
  fft(real, imag);
  const mags = new Float32Array(n / 2);
  for (let index = 0; index < mags.length; index += 1) mags[index] = Math.hypot(real[index], imag[index]);
  return mags;
}

/** Positive spectral flux peaks, with an 80 ms refractory window and an adaptive threshold. */
export function findOnsets(samples: Float32Array, sampleRate: number): number[] {
  const frame = 1024;
  const hop = Math.max(64, Math.round(sampleRate * 0.01));
  const fluxes: number[] = [];
  let previous: Float32Array | null = null;
  for (let start = 0; start + frame < samples.length; start += hop) {
    const mags = fluxFrame(samples, start, frame);
    let flux = 0;
    if (previous) {
      for (let index = 1; index < mags.length; index += 1) flux += Math.max(0, mags[index] - previous[index]);
    }
    previous = mags;
    fluxes.push(flux);
  }
  const onsets: number[] = [];
  let last = -Infinity;
  for (let index = 2; index < fluxes.length - 1; index += 1) {
    const history = fluxes.slice(Math.max(0, index - 30), index);
    const sorted = [...history].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
    // Median absolute deviation ignores one loud attack, so a ringing note does not hide the next one.
    const mad =
      sorted.reduce((sum, value) => sum + Math.abs(value - median), 0) / Math.max(1, sorted.length);
    const threshold = Math.max(median + mad * 3.5, median * 1.55, 1e-4);
    const time = ((index * hop) + frame / 2) / sampleRate;
    const peak = fluxes[index] >= fluxes[index - 1] && fluxes[index] > fluxes[index + 1] && fluxes[index] > threshold;
    if (peak && time - last >= REFRACTORY_SECONDS) {
      onsets.push(time);
      last = time;
    }
  }
  return onsets;
}

function yinPitch(frame: Float32Array, sampleRate: number): { freq: number; confidence: number } {
  const half = Math.floor(frame.length / 2);
  const difference = new Float32Array(half);
  for (let tau = 1; tau < half; tau += 1) {
    let sum = 0;
    for (let index = 0; index < half; index += 1) {
      const delta = frame[index] - frame[index + tau];
      sum += delta * delta;
    }
    difference[tau] = sum;
  }
  const normalized = new Float32Array(half);
  normalized[0] = 1;
  let running = 0;
  for (let tau = 1; tau < half; tau += 1) {
    running += difference[tau];
    normalized[tau] = running === 0 ? 1 : (difference[tau] * tau) / running;
  }
  const minTau = Math.max(2, Math.floor(sampleRate / 2000));
  const maxTau = Math.min(half - 2, Math.floor(sampleRate / 70));
  let tau = -1;
  for (let index = minTau; index <= maxTau; index += 1) {
    if (normalized[index] < 0.15) {
      while (index < maxTau && normalized[index + 1] < normalized[index]) index += 1;
      tau = index;
      break;
    }
  }
  if (tau < 0) {
    let best = 1;
    for (let index = minTau; index <= maxTau; index += 1) {
      if (normalized[index] < best) {
        best = normalized[index];
        tau = index;
      }
    }
  }
  if (tau < 1) return { freq: 0, confidence: 0 };
  const left = normalized[tau - 1];
  const center = normalized[tau];
  const right = normalized[tau + 1];
  const denom = left - 2 * center + right;
  const shift = denom === 0 ? 0 : (0.5 * (left - right)) / denom;
  const period = tau + Math.max(-1, Math.min(1, shift));
  return { freq: sampleRate / period, confidence: Math.max(0, Math.min(1, 1 - center)) };
}

function bandEnergy(mags: Float32Array, freq: number, sampleRate: number): number {
  const bin = (freq * mags.length * 2) / sampleRate;
  const center = Math.round(bin);
  if (center < 1 || center >= mags.length - 1) return 0;
  const left = mags[center - 1];
  const mid = mags[center];
  const right = mags[center + 1];
  const denom = left - 2 * mid + right;
  const shift = denom === 0 ? 0 : (0.5 * (left - right)) / denom;
  const peak = mid - 0.25 * (left - right) * Math.max(-1, Math.min(1, shift));
  return Math.max(0, peak);
}

function noiseFloor(mags: Float32Array): number {
  const sample: number[] = [];
  for (let index = 4; index < mags.length; index += 4) sample.push(mags[index]);
  if (sample.length === 0) return 0;
  sample.sort((left, right) => left - right);
  return sample[Math.floor(sample.length / 2)] ?? 0;
}

function subtractSpectrum(current: Float32Array, baseline: Float32Array | null): Float32Array {
  if (!baseline || baseline.length !== current.length) return current;
  const residual = new Float32Array(current.length);
  for (let index = 0; index < current.length; index += 1) residual[index] = Math.max(0, current[index] - baseline[index]);
  return residual;
}

function tongueFreq(drum: DrumKey, tongue: Tongue): number {
  return 440 * 2 ** ((noteMidi(drum, tongue.deg, tongue.oct) - 69) / 12);
}

function centsBetween(left: number, right: number): number {
  if (left <= 0 || right <= 0) return 1200;
  return Math.abs(1200 * Math.log2(left / right));
}

/** How far the residual spectral peak sits from a tongue, in cents. */
function spectralCents(mags: Float32Array, freq: number, sampleRate: number): number {
  const bin = (freq * mags.length * 2) / sampleRate;
  const center = Math.round(bin);
  if (center < 1 || center >= mags.length - 1) return 1200;
  const left = mags[center - 1];
  const mid = mags[center];
  const right = mags[center + 1];
  const denom = left - 2 * mid + right;
  const shift = denom === 0 ? 0 : (0.5 * (left - right)) / denom;
  const peakBin = center + Math.max(-1, Math.min(1, shift));
  const peakFreq = (peakBin * sampleRate) / (mags.length * 2);
  return centsBetween(peakFreq, freq);
}

export function quantizeGap(seconds: number, bpm: number, grid: number): number {
  if (!(bpm > 0) || !(grid > 0)) return grid;
  const beats = (seconds * bpm) / 60;
  const steps = Math.max(1, Math.round(beats / grid));
  return steps * grid;
}

type Candidate = { tongue: Tongue; score: number; cents: number };

function isOctavePair(left: Tongue, right: Tongue): boolean {
  return left.deg === right.deg && Math.abs(left.oct - right.oct) === 1;
}

/**
 * Prefer the higher tongue unless the lower one has its own fundamental,
 * measured against its 2f and the noise floor. Returns whether that choice was decisive.
 */
function preferOctave(
  ranked: Candidate[],
  mags: Float32Array,
  sampleRate: number,
  drum: DrumKey,
): { best: Candidate | null; octaveResolved: boolean } {
  const best = ranked[0] ?? null;
  if (!best) return { best, octaveResolved: false };
  const partner = ranked.find((candidate) => isOctavePair(candidate.tongue, best.tongue));
  if (!partner || partner.score <= 0) return { best, octaveResolved: false };
  const lower = best.tongue.oct < partner.tongue.oct ? best : partner;
  const higher = lower === best ? partner : best;
  const lowFreq = tongueFreq(drum, lower.tongue);
  const fundamental = bandEnergy(mags, lowFreq, sampleRate);
  const second = bandEnergy(mags, lowFreq * 2, sampleRate);
  const floor = noiseFloor(mags);
  const clearlyLow = fundamental > floor * 12 && fundamental > second * 0.85;
  const clearlyHigh = fundamental < second * 0.35 || fundamental < floor * 5;
  const higherHasEnergy = higher.score > lower.score * 0.35;
  if (clearlyHigh && higherHasEnergy) return { best: higher, octaveResolved: true };
  if (clearlyLow) return { best: lower, octaveResolved: true };
  return { best, octaveResolved: false };
}

function scoreTongues(
  frame: Float32Array,
  sampleRate: number,
  drum: DrumKey,
  baseline: Float32Array | null,
): { best: Candidate | null; confidence: number; octaveResolved: boolean; spectralCents: number } {
  const mags = subtractSpectrum(magnitudeSpectrum(frame), baseline);
  const yin = yinPitch(frame, sampleRate);
  const tongues = layoutById(DRUM_LAYOUT[drum]).tongues;
  const ranked: Candidate[] = tongues.map((tongue) => {
    const freq = tongueFreq(drum, tongue);
    const fundamental = bandEnergy(mags, freq, sampleRate);
    const second = bandEnergy(mags, freq * 2, sampleRate);
    const third = bandEnergy(mags, freq * 3, sampleRate);
    const sub = bandEnergy(mags, freq / 2, sampleRate);
    // A small, capped f/2 term. A large subtraction made the lower octave win on the higher note's fundamental.
    const harmonic = fundamental + 0.35 * second + 0.16 * third - Math.min(sub, fundamental * 0.35) * 0.2;
    const cents = centsBetween(yin.freq, freq);
    const yinWeight = yin.confidence * Math.exp(-(cents * cents) / (2 * 45 * 45));
    return { tongue, score: Math.max(0, harmonic) * (0.82 + 0.35 * yinWeight), cents };
  });
  ranked.sort((left, right) => right.score - left.score);
  const choice = preferOctave(ranked, mags, sampleRate, drum);
  const best = choice.best;
  const rival = ranked.find((candidate) => best && candidate !== best && !isOctavePair(candidate.tongue, best.tongue));
  if (!best || best.score <= 0) return { best, confidence: 0, octaveResolved: false, spectralCents: 1200 };
  const margin = rival && rival.score > 0 ? best.score / rival.score : 2;
  const confidence = Math.min(1, (0.62 + 0.38 * Math.max(yin.confidence, margin > 1.4 ? 0.7 : 0)) * Math.min(margin, 2));
  return {
    best,
    confidence,
    octaveResolved: choice.octaveResolved,
    spectralCents: spectralCents(mags, tongueFreq(drum, best.tongue), sampleRate),
  };
}

export function detectNotes(samples: Float32Array, sampleRate: number, options: DetectOptions): DetectedNote[] {
  const onsets = findOnsets(samples, sampleRate);
  const notes: DetectedNote[] = [];
  const startSamples = Math.floor(PITCH_START * sampleRate);
  const endSamples = Math.floor(PITCH_END * sampleRate);
  for (let index = 0; index < onsets.length; index += 1) {
    const at = onsets[index];
    const origin = Math.floor(at * sampleRate);
    if (origin + endSamples >= samples.length) break;
    const frameLength = endSamples - startSamples;
    const preEnd = origin - Math.floor(0.01 * sampleRate);
    const preStart = preEnd - frameLength;
    const baseline = preStart >= 0 ? magnitudeSpectrum(samples.subarray(preStart, preEnd)) : null;
    const frame = samples.subarray(origin + startSamples, origin + endSamples);
    const scored = scoreTongues(frame, sampleRate, options.drum, baseline);
    const next = onsets[index + 1];
    const dur = next == null ? options.grid : quantizeGap(next - at, options.bpm, options.grid);
    if (!scored.best) continue;
    // YIN still hears a ringing tongue, so a far YIN miss does not flag a clear spectrum.
    // A YIN pitch near this tongue but more than 50 cents off is an out-of-tune guess.
    const spectrumSure = scored.confidence >= 0.7 || scored.octaveResolved;
    const yinNear = scored.best.cents <= 150;
    const outOfTune = yinNear && scored.best.cents > CENTS_LIMIT;
    const uncertain = outOfTune || scored.spectralCents >= CENTS_LIMIT - 5 || (!spectrumSure && scored.confidence < 0.45);
    notes.push({
      deg: scored.best.tongue.deg,
      oct: scored.best.tongue.oct,
      dur,
      uncertain,
      at,
    });
  }
  return notes;
}

export function tongueAccuracy(
  expected: Tongue[],
  detected: Pick<DetectedNote, "deg" | "oct" | "uncertain">[],
): number {
  if (expected.length === 0) return 0;
  const length = Math.max(expected.length, detected.length);
  let correct = 0;
  for (let index = 0; index < expected.length; index += 1) {
    const note = detected[index];
    const tongue = expected[index];
    if (note && !note.uncertain && note.deg === tongue.deg && note.oct === tongue.oct) correct += 1;
  }
  return correct / length;
}
