import type { Segment } from "../../../shared/ipc/stt/transcribe";

export type SegBarKind = "ok" | "low" | "silenceOut";

export interface ConfidenceBar {
  index: number; // 0-based segment index
  text: string;
  tStart: number; // audio seconds
  tEnd: number;
  tMid: number; // plotted x (audio seconds)
  confidence: number | null; // 0..1 from exp(avg_logprob); null when unmeasured
  noSpeechProb: number | null;
  kind: SegBarKind;
}

export interface ConfidenceStats {
  measuredCount: number; // segments with a confidence value
  meanConfidence: number | null; // mean over measured (null if none)
  lowCount: number; // kind === "low"
  silenceOutCount: number; // kind === "silenceOut"
}

export interface ConfidenceChart {
  bars: ConfidenceBar[];
  stats: ConfidenceStats;
  audioSecs: number; // x-domain max
}

// Whisper's own decoding-quality gates — stable, interpretable, run-independent.
// avg_logprob < -1.0 is whisper's decode-failure cut; no_speech_prob > 0.6 is its
// default no_speech_threshold. Using these (not a per-run robust threshold) avoids
// mislabelling the relatively-worst segment of an otherwise-clean transcript.
const LOW_LOGPROB = -1.0;
const NO_SPEECH_THRESHOLD = 0.6;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/// Map a transcript's segments to per-segment confidence bars over the audio
/// timeline. `confidence` is exp(avg_logprob) in 0..1, or null when the backend
/// emitted no logprob (rendered as a gap — never a guessed 0). A segment is
/// `silenceOut` when whisper flags it as non-speech yet emitted text (hallucination
/// risk), else `low` when its logprob is below the decode-failure gate, else `ok`.
/// Pure.
export function buildConfidenceTimeline(segments: Segment[], audioSecs: number): ConfidenceChart {
  let measuredSum = 0;
  let measuredCount = 0;
  let lowCount = 0;
  let silenceOutCount = 0;

  const bars: ConfidenceBar[] = segments.map((s, i) => {
    const confidence = s.avg_logprob == null ? null : clamp01(Math.exp(s.avg_logprob));
    if (confidence != null) {
      measuredSum += confidence;
      measuredCount += 1;
    }
    const hasText = s.text.trim() !== "";
    const isSilenceOut = s.no_speech_prob != null && s.no_speech_prob > NO_SPEECH_THRESHOLD && hasText;
    const isLow = s.avg_logprob != null && s.avg_logprob < LOW_LOGPROB;
    const kind: SegBarKind = isSilenceOut ? "silenceOut" : isLow ? "low" : "ok";
    if (kind === "silenceOut") silenceOutCount += 1;
    else if (kind === "low") lowCount += 1;

    const tStart = s.start_secs;
    const tEnd = Math.max(s.start_secs, s.end_secs);
    return {
      index: i,
      text: s.text,
      tStart,
      tEnd,
      tMid: (tStart + tEnd) / 2,
      confidence,
      noSpeechProb: s.no_speech_prob,
      kind,
    };
  });

  // x-domain: prefer the declared audio length; fall back to the last segment end
  // so bars never overflow when duration is missing/short.
  const lastEnd = bars.reduce((m, b) => Math.max(m, b.tEnd), 0);
  return {
    bars,
    stats: {
      measuredCount,
      meanConfidence: measuredCount > 0 ? measuredSum / measuredCount : null,
      lowCount,
      silenceOutCount,
    },
    audioSecs: Math.max(audioSecs, lastEnd),
  };
}
