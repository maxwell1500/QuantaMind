use crate::commands::stt::eval::{evals_dir, reports_dir, transcripts_dir};
use crate::errors::{AppError, AppResult};
use crate::inference::stt::eval::report::SttReport;
use crate::inference::stt::eval::scorer::{SttScorer, WerScorer};
use crate::inference::stt::eval::spec::SttEvalSpec;
use crate::persistence::stt::{eval_reports, eval_specs, transcripts};
use std::path::Path;
use tauri::AppHandle;

/// The **dumb runner** (no AppHandle, testable): for each task, load its transcript
/// **by id**, score it, stream the row to disk, then drop the transcript + its
/// alignment matrix before the next. A missing transcript yields no row (an
/// explicit skip, never a silent positional mis-pair). Never owns transcription.
pub(crate) fn run(
    transcripts_dir: &Path,
    reports_dir: &Path,
    spec_name: &str,
    spec: &SttEvalSpec,
) -> AppResult<SttReport> {
    eval_reports::start(reports_dir, spec_name)?;
    let scorer = WerScorer;
    for task in &spec.tasks {
        if let Some(t) = transcripts::load(transcripts_dir, &task.id)? {
            let row = scorer.score(&t, task);
            eval_reports::append_row(reports_dir, spec_name, &row)?;
        }
    }
    Ok(eval_reports::load(reports_dir, spec_name)?.unwrap_or_default())
}

/// Run an eval spec against the stored transcripts → a streamed `SttReport`.
#[tauri::command]
pub fn run_stt_eval(app: AppHandle, spec: String) -> Result<SttReport, AppError> {
    let s = eval_specs::load(&evals_dir(&app)?, &spec)?;
    run(&transcripts_dir(&app)?, &reports_dir(&app)?, &spec, &s)
}

#[tauri::command]
pub fn list_stt_evals(app: AppHandle) -> Result<Vec<String>, AppError> {
    eval_specs::list(&evals_dir(&app)?)
}

#[tauri::command]
pub fn load_stt_eval(app: AppHandle, name: String) -> Result<SttEvalSpec, AppError> {
    eval_specs::load(&evals_dir(&app)?, &name)
}

#[tauri::command]
pub fn save_stt_eval(app: AppHandle, name: String, spec: SttEvalSpec) -> Result<(), AppError> {
    eval_specs::save(&evals_dir(&app)?, &name, &spec)
}

#[tauri::command]
pub fn delete_stt_eval(app: AppHandle, name: String) -> Result<(), AppError> {
    eval_specs::delete(&evals_dir(&app)?, &name)
}

#[tauri::command]
pub fn load_stt_report(app: AppHandle, spec: String) -> Result<Option<SttReport>, AppError> {
    eval_reports::load(&reports_dir(&app)?, &spec)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::inference::stt::eval::spec::SttEvalTask;
    use crate::inference::stt::transcribe::transcript::{
        AudioSpec, Segment, TranscribeStats, Transcript,
    };

    fn store_transcript(dir: &Path, id: &str, model: &str, text: &str) {
        let t = Transcript {
            id: id.into(),
            model: model.into(),
            language: Some("en".into()),
            audio: AudioSpec { sample_rate_hz: 16_000, channels: 1, duration_secs: 1.0 },
            segments: vec![Segment {
                text: text.into(),
                start_secs: 0.0,
                end_secs: 1.0,
                avg_logprob: Some(-0.2),
                no_speech_prob: Some(0.01),
                words: None,
            }],
            complete: true,
            stats: TranscribeStats { rtf: Some(2.0), ..Default::default() },
            stt_profile: None,
        };
        transcripts::save(dir, &t).unwrap();
    }

    #[test]
    fn rows_join_transcripts_by_id_not_position() {
        let tdir = tempfile::tempdir().unwrap();
        let rdir = tempfile::tempdir().unwrap();
        store_transcript(tdir.path(), "a", "whisper-A", "the quick brown fox");
        store_transcript(tdir.path(), "b", "whisper-B", "hello world");
        // Spec ordered [b, a] — the opposite of nothing in particular; the point is
        // each row must carry ITS transcript's model, proving the id join.
        let spec = SttEvalSpec {
            tasks: vec![
                SttEvalTask { id: "b".into(), reference: Some("hello world".into()), critical_tokens: vec![] },
                SttEvalTask { id: "a".into(), reference: Some("the quick brown fox".into()), critical_tokens: vec![] },
            ],
        };
        let report = run(tdir.path(), rdir.path(), "run", &spec).unwrap();
        assert_eq!(report.rows.len(), 2);
        assert_eq!(report.rows[0].task_id, "b");
        assert_eq!(report.rows[0].model, "whisper-B", "task b scored transcript b, by id");
        assert_eq!(report.rows[1].task_id, "a");
        assert_eq!(report.rows[1].model, "whisper-A");
        assert_eq!(report.rows[0].wer.as_ref().map(|w| w.wer), Some(0.0));
    }

    #[test]
    fn a_missing_transcript_yields_no_row_never_a_fabricated_one() {
        let tdir = tempfile::tempdir().unwrap();
        let rdir = tempfile::tempdir().unwrap();
        store_transcript(tdir.path(), "present", "whisper", "hi");
        let spec = SttEvalSpec {
            tasks: vec![
                SttEvalTask { id: "present".into(), reference: Some("hi".into()), critical_tokens: vec![] },
                SttEvalTask { id: "missing".into(), reference: Some("nope".into()), critical_tokens: vec![] },
            ],
        };
        let report = run(tdir.path(), rdir.path(), "run", &spec).unwrap();
        assert_eq!(report.rows.len(), 1, "the missing transcript is skipped, not fabricated");
        assert_eq!(report.rows[0].task_id, "present");
    }
}
