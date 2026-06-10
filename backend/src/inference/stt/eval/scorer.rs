use crate::inference::stt::eval::report::SttReportRow;
use crate::inference::stt::eval::spec::SttEvalTask;
use crate::inference::stt::eval::wer::{score_wer, HypWord};
use crate::inference::stt::transcribe::transcript::Transcript;

/// A swappable scoring strategy over a stored `Transcript` + a task. New metrics
/// (semantic, phonetic, …) drop in here without touching the eval runner — the
/// runner just loads files and calls `score`.
pub trait SttScorer {
    fn score(&self, transcript: &Transcript, task: &SttEvalTask) -> SttReportRow;
}

/// The v1 scorer: WER (only when a reference exists) + behavioral/RTF passthrough
/// from the P3 `SttProfile`. No fabricated accuracy — `wer` stays `None` for a
/// reference-less task and nothing else is affected.
pub struct WerScorer;

impl SttScorer for WerScorer {
    fn score(&self, transcript: &Transcript, task: &SttEvalTask) -> SttReportRow {
        let behavioral = transcript.stt_profile.as_ref().and_then(|p| p.behavioral.as_ref());
        // WER **only** when the task carries a reference; otherwise accuracy is
        // unverified and the field is `None` (the gate handles it downstream).
        let wer = task.reference.as_ref().map(|reference| {
            score_wer(reference, &hypothesis_words(transcript), &task.critical_tokens)
        });
        SttReportRow {
            task_id: task.id.clone(),
            model: transcript.model.clone(),
            rtf: transcript.stats.rtf,
            repeat_rate: behavioral.and_then(|b| b.repeat_rate),
            silence_rate: behavioral.and_then(|b| b.silence_hallucination_rate),
            confidence: behavioral.and_then(|b| b.confidence.as_ref()).map(|c| c.mean as f64),
            wer,
        }
    }
}

/// Flatten the transcript's words (with confidences) for alignment. Falls back to
/// splitting segment text when the backend emitted no word-level data — WER still
/// scores, just with no per-word probability (so no misread flagging).
fn hypothesis_words(t: &Transcript) -> Vec<HypWord> {
    let mut out = Vec::new();
    for seg in &t.segments {
        match &seg.words {
            Some(ws) if !ws.is_empty() => {
                out.extend(ws.iter().map(|w| HypWord { text: w.text.clone(), prob: w.probability }));
            }
            _ => out.extend(seg.text.split_whitespace().map(|tok| HypWord { text: tok.to_string(), prob: None })),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::stt::transcribe::transcript::{
        AudioSpec, BehavioralProfile, Confidence, Segment, SttProfile, TranscribeStats,
    };

    fn transcript(text: &str) -> Transcript {
        Transcript {
            id: "clip-1".into(),
            model: "ggml-tiny.en.bin".into(),
            language: Some("en".into()),
            audio: AudioSpec { sample_rate_hz: 16_000, channels: 1, duration_secs: 3.0 },
            segments: vec![Segment {
                text: text.into(),
                start_secs: 0.0,
                end_secs: 3.0,
                avg_logprob: Some(-0.2),
                no_speech_prob: Some(0.01),
                words: None,
            }],
            complete: true,
            stats: TranscribeStats { rtf: Some(2.5), ..Default::default() },
            stt_profile: Some(SttProfile {
                perf: None,
                behavioral: Some(BehavioralProfile {
                    repeat_rate: Some(0.0),
                    confidence: Some(Confidence { mean: 0.9, low_percentile: 0.4 }),
                    silence_hallucination_rate: Some(0.0),
                }),
                vram_bytes: None,
            }),
        }
    }

    #[test]
    fn a_reference_task_computes_wer_and_passes_behavioral_through() {
        let t = transcript("transfer one hundred dollars");
        let task = SttEvalTask { id: "t1".into(), reference: Some("transfer one hundred dollars".into()), critical_tokens: vec![] };
        let row = WerScorer.score(&t, &task);
        assert_eq!(row.wer.as_ref().map(|w| w.wer), Some(0.0));
        assert_eq!(row.rtf, Some(2.5));
        assert_eq!(row.repeat_rate, Some(0.0));
        assert!(row.confidence.is_some_and(|c| (c - 0.9).abs() < 1e-6)); // f32→f64
        assert_eq!(row.model, "ggml-tiny.en.bin");
    }

    #[test]
    fn a_reference_less_task_has_no_wer_but_behavioral_is_unaffected() {
        // The no-bleed guarantee: a None WER must not touch rtf/repeat/silence/conf.
        let t = transcript("anything at all");
        let task = SttEvalTask { id: "t2".into(), reference: None, critical_tokens: vec![] };
        let row = WerScorer.score(&t, &task);
        assert_eq!(row.wer, None, "no reference → no fabricated accuracy");
        assert_eq!(row.rtf, Some(2.5));
        assert_eq!(row.repeat_rate, Some(0.0));
        assert_eq!(row.silence_rate, Some(0.0));
        assert!(row.confidence.is_some_and(|c| (c - 0.9).abs() < 1e-6));
    }
}
