import { useCallback, useRef, useState } from "react";

/// Encode mono Float32 PCM as a 16-bit WAV (Rust resamples to 16 kHz). Returned
/// as bytes so nothing decoded lives in a JS store after hand-off.
function encodeWav(pcm: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(bytes);
  const w = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  w(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let off = 44;
  for (let i = 0; i < pcm.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(bytes);
}

function peak(pcm: Float32Array): number {
  let p = 0;
  for (let i = 0; i < pcm.length; i++) p = Math.max(p, Math.abs(pcm[i]));
  return p;
}

export interface RecordingResult {
  bytes: Uint8Array;
  /// False when the whole take is essentially silent — surfaces "no audio
  /// detected" (muted/wrong mic) instead of a blank "successful" run.
  hadAudio: boolean;
}

/// Microphone capture via Web Audio. Start opens the stream + accumulates raw
/// mono PCM with a live RMS level; Stop tears the stream/tracks/AudioContext down
/// (frees the ring buffer, mic indicator off) and returns the take as WAV bytes.
/// Stop-without-Start / double-Stop are no-ops.
export function useMicRecorder() {
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const rateRef = useRef(48_000);
  const [recording, setRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const teardown = useCallback(async () => {
    try {
      procRef.current?.disconnect();
    } catch {
      /* already gone */
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    try {
      await ctxRef.current?.close();
    } catch {
      /* already closed */
    }
    procRef.current = null;
    streamRef.current = null;
    ctxRef.current = null;
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    if (recording) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      rateRef.current = ctx.sampleRate;
      const src = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      procRef.current = proc;
      chunksRef.current = [];
      proc.onaudioprocess = (e) => {
        const data = e.inputBuffer.getChannelData(0);
        chunksRef.current.push(new Float32Array(data));
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        setLevel(Math.sqrt(sum / data.length));
      };
      src.connect(proc);
      proc.connect(ctx.destination);
      setRecording(true);
    } catch {
      await teardown();
      setError("Microphone access failed — check permissions and that a mic is connected.");
    }
  }, [recording, teardown]);

  const stop = useCallback(async (): Promise<RecordingResult | null> => {
    if (!recording) return null; // no-op: stop without record / double stop
    setRecording(false);
    const chunks = chunksRef.current;
    chunksRef.current = [];
    const rate = rateRef.current;
    await teardown();
    const total = chunks.reduce((n, c) => n + c.length, 0);
    const pcm = new Float32Array(total);
    let off = 0;
    for (const c of chunks) {
      pcm.set(c, off);
      off += c.length;
    }
    return { bytes: encodeWav(pcm, rate), hadAudio: peak(pcm) > 0.005 };
  }, [recording, teardown]);

  return { start, stop, recording, level, error };
}
