import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";

export const EVENT_STT_SEGMENTS = "stt-segments";
export const EVENT_STT_TRANSCRIBE_PROGRESS = "stt-transcribe-progress";

export const WordSchema = z.object({
  text: z.string(),
  start_secs: z.number(),
  end_secs: z.number(),
  probability: z.number().nullable(),
});
export type Word = z.infer<typeof WordSchema>;

export const SegmentSchema = z.object({
  text: z.string(),
  start_secs: z.number(),
  end_secs: z.number(),
  avg_logprob: z.number().nullable(),
  no_speech_prob: z.number().nullable(),
  words: z.array(WordSchema).nullable(),
});
export type Segment = z.infer<typeof SegmentSchema>;

export const AudioSpecSchema = z.object({
  sample_rate_hz: z.number(),
  channels: z.number(),
  duration_secs: z.number(),
});

export const TranscribeStatsSchema = z.object({
  source_duration_secs: z.number().nullable(),
  audio_decoded_secs: z.number().nullable(),
  transcribe_wall_ms: z.number().nullable(),
  segment_count: z.number().nullable(),
  detected_language: z.string().nullable(),
  received_sample_rate_hz: z.number().nullable(),
  rtf: z.number().nullable(),
});

/// Word-level confidence (0..1). Mirrors Rust `Confidence`; the enclosing field
/// is null when the backend emits no probabilities (never 0/1 — see no-fake-metrics).
export const ConfidenceSchema = z.object({
  mean: z.number(),
  low_percentile: z.number(),
});

export const PerfProfileSchema = z.object({
  first_segment_ms: z.number().nullable(),
  encode_ms: z.number().nullable(),
  decode_ms: z.number().nullable(),
});

export const BehavioralProfileSchema = z.object({
  repeat_rate: z.number().nullable(),
  confidence: ConfidenceSchema.nullable(),
  silence_hallucination_rate: z.number().nullable(),
});

/// The measured STT profile (P3). Every field nullable → the panel renders "N/A".
export const SttProfileSchema = z.object({
  perf: PerfProfileSchema.nullable(),
  behavioral: BehavioralProfileSchema.nullable(),
  vram_bytes: z.number().nullable(),
});
export type SttProfile = z.infer<typeof SttProfileSchema>;

export const TranscriptSchema = z.object({
  id: z.string(),
  model: z.string(),
  language: z.string().nullable(),
  audio: AudioSpecSchema,
  segments: z.array(SegmentSchema),
  complete: z.boolean(),
  stats: TranscribeStatsSchema,
  stt_profile: SttProfileSchema.nullable(),
});
export type Transcript = z.infer<typeof TranscriptSchema>;

/// One window's segments (timestamps already absolute), streamed live.
export const SegmentsPayloadSchema = z.object({ segments: z.array(SegmentSchema) });
export const ProgressPayloadSchema = z.object({ processed_secs: z.number(), total_secs: z.number() });

/// Transcribe an audio file with the running whisper.cpp server; persists +
/// returns the canonical Transcript. Segments also stream via EVENT_STT_SEGMENTS.
export async function transcribeAudio(path: string, id: string): Promise<Transcript> {
  return TranscriptSchema.parse(await invoke("transcribe_audio", { path, id }));
}

/// Reload a persisted transcript by id (disk is the source of truth).
export async function loadTranscript(id: string): Promise<Transcript | null> {
  return TranscriptSchema.nullable().parse(await invoke("load_transcript", { id }));
}
