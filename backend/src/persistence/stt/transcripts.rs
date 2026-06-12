use crate::errors::{AppError, AppResult};
use crate::inference::stt::transcribe::transcript::Transcript;
use crate::persistence::readiness::safe_filename::safe_filename;
use std::path::{Path, PathBuf};

/// Transcripts of long audio can exceed the 1 MB report cap; 8 MB still guards a
/// corrupt/huge file from OOMing the process.
pub const MAX_BYTES: u64 = 8 * 1024 * 1024;

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
}
