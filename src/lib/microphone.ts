import { audioContextReady, beginRecordingAudio, endRecordingAudio } from "./audio";

export const MIC_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

export async function openMicrophone(): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw new Error("This browser has no microphone API.");
  }
  return navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
}

export function describeMicError(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Microphone access was denied. You can keep editing by tapping the drum.";
  }
  if (name === "NotFoundError" || name === "NotReadableError") {
    return "No microphone was found. You can keep editing by tapping the drum.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "The microphone could not be opened. You can keep editing by tapping the drum.";
}

/** Pull mic samples without playing them back. Returns a function that stops the tap. */
export function listenToMicrophone(
  stream: MediaStream,
  onSamples: (chunk: Float32Array, sampleRate: number) => void,
  options?: { stopTracks?: boolean },
): () => void {
  const ctx = audioContextReady();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(2048, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  processor.onaudioprocess = (event) => {
    onSamples(new Float32Array(event.inputBuffer.getChannelData(0)), ctx.sampleRate);
  };
  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);
  return () => {
    processor.onaudioprocess = null;
    processor.disconnect();
    source.disconnect();
    mute.disconnect();
    if (options?.stopTracks !== false) {
      for (const track of stream.getTracks()) track.stop();
      endRecordingAudio();
    }
  };
}

export function recordingSession(): void {
  beginRecordingAudio();
}
