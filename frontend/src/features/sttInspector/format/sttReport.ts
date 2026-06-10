import type { Transcript } from "../../../shared/ipc/stt/transcribe";
import { wordCount, wordsPerSec } from "./sttMetrics";

const NA = "N/A";
const num = (v: number | null | undefined, fmt: (n: number) => string) => (v == null ? NA : fmt(v));
const pct = (v: number | null | undefined) => (v == null ? NA : `${Math.round(v * 100)}%`);

/// The derived, honest metric set for one transcript. Every field that the backend
/// couldn't supply is null here and renders "N/A" downstream — never a guessed 0.
function metrics(t: Transcript) {
  const conf = t.stt_profile?.behavioral?.confidence ?? null;
  return {
    model: t.model,
    language: t.stats.detected_language ?? t.language,
    audio: {
      sample_rate_hz: t.audio.sample_rate_hz,
      channels: t.audio.channels,
      duration_secs: t.stats.audio_decoded_secs,
      source_duration_secs: t.stats.source_duration_secs,
    },
    real_time_factor: t.stats.rtf,
    transcribe_wall_ms: t.stats.transcribe_wall_ms,
    first_segment_ms: t.stt_profile?.perf?.first_segment_ms ?? null,
    segment_count: t.stats.segment_count,
    word_count: wordCount(t.segments),
    words_per_sec: wordsPerSec(t),
    mean_confidence: conf?.mean ?? null,
    low_percentile_confidence: conf?.low_percentile ?? null,
    repeat_rate: t.stt_profile?.behavioral?.repeat_rate ?? null,
    silence_output_rate: t.stt_profile?.behavioral?.silence_hallucination_rate ?? null,
    vram_bytes: t.stt_profile?.vram_bytes ?? null, // always null for whisper.cpp
  };
}

/// Self-contained JSON report (the derived metrics + the raw segments). Pure.
export function toSttJson(t: Transcript): string {
  return JSON.stringify(
    {
      schema_version: "stt-report/1.0.0",
      document_type: "stt-transcript-report",
      transcript_id: t.id,
      metrics: metrics(t),
      segments: t.segments,
    },
    null,
    2,
  );
}

/// Human-readable Markdown report. Nulls render "N/A". Pure.
export function toSttMarkdown(t: Transcript): string {
  const m = metrics(t);
  const text = t.segments.map((s) => s.text.trim()).filter(Boolean).join(" ");
  const rows = t.segments
    .map((s) => {
      const conf = s.avg_logprob == null ? NA : `${Math.round(Math.min(1, Math.exp(s.avg_logprob)) * 100)}%`;
      return `| ${s.start_secs.toFixed(2)} | ${s.end_secs.toFixed(2)} | ${conf} | ${s.text.trim().replace(/\|/g, "\\|")} |`;
    })
    .join("\n");

  return `# Whisper.cpp transcript report

- **Model:** ${m.model}
- **Language:** ${m.language ?? NA}
- **Audio:** ${num(m.audio.duration_secs, (v) => `${v.toFixed(1)}s`)} · ${m.audio.sample_rate_hz} Hz · ${m.audio.channels}ch

## Metrics

| Metric | Value |
| --- | --- |
| Real-time factor | ${num(m.real_time_factor, (v) => `${v.toFixed(2)}×`)} |
| Transcribe wall | ${num(m.transcribe_wall_ms, (v) => `${(v / 1000).toFixed(1)}s`)} |
| First-segment latency | ${num(m.first_segment_ms, (v) => `${v} ms`)} |
| Segments | ${m.segment_count ?? NA} |
| Words | ${m.word_count} |
| Words / sec | ${num(m.words_per_sec, (v) => v.toFixed(1))} |
| Mean confidence | ${pct(m.mean_confidence)}${m.low_percentile_confidence == null ? "" : ` (low ${pct(m.low_percentile_confidence)})`} |
| Repeated-segment rate | ${pct(m.repeat_rate)} |
| Output during silence | ${pct(m.silence_output_rate)} |
| VRAM | Not available for this backend |

## Transcript

${text || "_No speech transcribed_"}

## Segments

| Start (s) | End (s) | Confidence | Text |
| --- | --- | --- | --- |
${rows}
`;
}
