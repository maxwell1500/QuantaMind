use crate::errors::{AppError, AppResult};
use crate::inference::stt::transcribe::transcript::Transcript;
use crate::persistence::readiness::safe_filename::safe_filename;
use serde::Serialize;
use std::path::{Path, PathBuf};

/// Transcripts of long audio can exceed the 1 MB report cap; 8 MB still guards a
/// corrupt/huge file from OOMing the process.
pub const MAX_BYTES: u64 = 8 * 1024 * 1024;

/// A lightweight transcript row for the eval spec editor: the id (the eval join
/// key), the model that produced it, and the full transcribed text (so the editor
/// can prefill a reference and the starter spec can self-reference).
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct TranscriptSummary {
    pub id: String,
    pub model: String,
    pub text: String,
}

/// Joined, trimmed transcript text — the same shape the exports use.
fn transcript_text(t: &Transcript) -> String {
    t.segments
        .iter()
        .map(|s| s.text.trim())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

/// Summaries of every stored transcript, sorted by id. A missing dir is empty (not
/// an error); an unreadable/corrupt file is skipped, never fatal — the editor must
/// still list the good ones.
pub fn list_summaries(dir: &Path) -> AppResult<Vec<TranscriptSummary>> {
    let mut out = Vec::new();
    if !dir.exists() {
        return Ok(out);
    }
    for entry in std::fs::read_dir(dir)? {
        let path = entry?.path();
        if path.extension().is_some_and(|e| e == "json") {
            let len = std::fs::metadata(&path)?.len();
            if len > MAX_BYTES {
                continue;
            }
            if let Ok(t) = serde_json::from_str::<Transcript>(&std::fs::read_to_string(&path)?) {
                out.push(TranscriptSummary { id: t.id.clone(), model: t.model.clone(), text: transcript_text(&t) });
            }
        }
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

fn transcript_path(dir: &Path, id: &str) -> PathBuf {
    dir.join(format!("{}.json", safe_filename(id)))
}

/// Persist a transcript as the canonical JSON artifact, **atomically** (write a
/// temp then rename) so a crash never leaves a half-written file. Refuses an
/// incomplete transcript — a truncated run must never land as final.
pub fn save(dir: &Path, t: &Transcript) -> AppResult<()> {
    if !t.complete {
        return Err(AppError::Validation(
            "refusing to persist an incomplete transcript".into(),
        ));
    }
    std::fs::create_dir_all(dir)?;
    let json = serde_json::to_string_pretty(t)?;
    let final_path = transcript_path(dir, &t.id);
    let tmp = final_path.with_extension("json.tmp");
    std::fs::write(&tmp, json)?;
    std::fs::rename(&tmp, &final_path)?;
    Ok(())
}

/// Load a persisted transcript by id, or `None` when absent. Size-capped.
pub fn load(dir: &Path, id: &str) -> AppResult<Option<Transcript>> {
    let path = transcript_path(dir, id);
    if !path.exists() {
        return Ok(None);
    }
    let len = std::fs::metadata(&path)?.len();
    if len > MAX_BYTES {
        return Err(AppError::Validation(format!(
            "transcript file is too large ({len} bytes > {MAX_BYTES} cap)"
        )));
    }
    Ok(Some(serde_json::from_str(&std::fs::read_to_string(&path)?)?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::stt::transcribe::transcript::{AudioSpec, Segment, TranscribeStats};

    fn transcript(id: &str, complete: bool) -> Transcript {
        Transcript {
            id: id.into(),
            model: "ggml-tiny.en.bin".into(),
            language: Some("en".into()),
            audio: AudioSpec { sample_rate_hz: 16_000, channels: 1, duration_secs: 2.0 },
            segments: vec![Segment {
                text: " hi".into(),
                start_secs: 1.0,
                end_secs: 2.0,
                avg_logprob: Some(-0.2),
                no_speech_prob: Some(0.01),
                words: None,
            }],
            complete,
            stats: TranscribeStats { segment_count: Some(1), ..Default::default() },
            stt_profile: None,
        }
    }

    #[test]
    fn save_then_load_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let t = transcript("clip-1", true);
        save(dir.path(), &t).unwrap();
        let back = load(dir.path(), "clip-1").unwrap().unwrap();
        assert_eq!(t, back, "write -> read -> deep-equal");
    }

    #[test]
    fn incomplete_transcript_is_refused_and_not_written() {
        let dir = tempfile::tempdir().unwrap();
        let t = transcript("partial", false);
        assert!(save(dir.path(), &t).is_err(), "incomplete must not persist");
        assert!(load(dir.path(), "partial").unwrap().is_none(), "no file landed");
    }

    #[test]
    fn missing_transcript_is_none_not_error() {
        let dir = tempfile::tempdir().unwrap();
        assert!(load(dir.path(), "nope").unwrap().is_none());
    }

    #[test]
    fn list_summaries_returns_id_model_and_joined_text_sorted() {
        let dir = tempfile::tempdir().unwrap();
        save(dir.path(), &transcript("clip-b", true)).unwrap();
        save(dir.path(), &transcript("clip-a", true)).unwrap();
        let s = list_summaries(dir.path()).unwrap();
        assert_eq!(s.len(), 2);
        assert_eq!(s[0].id, "clip-a", "sorted by id");
        assert_eq!(s[0].model, "ggml-tiny.en.bin");
        assert_eq!(s[0].text, "hi", "joined + trimmed (the segment was ' hi')");
    }

    #[test]
    fn list_summaries_is_empty_for_a_missing_dir() {
        let dir = tempfile::tempdir().unwrap();
        assert!(list_summaries(&dir.path().join("nope")).unwrap().is_empty());
    }
}
