use crate::commands::emit::log_emit;
use crate::commands::stt::mlx::mlx_stt_server_types::MlxSttServerState;
use crate::commands::stt::stt_server_types::SttServerState;
use crate::commands::storage::storage_disk::{mlx_model_dir, mlx_stt_dir};
use crate::errors::{AppError, AppResult};
use crate::inference::stt::transcribe::backend::{transcribe as run_transcribe, SttTranscribeEngine};
use crate::inference::stt::transcribe::sink::TranscribeSink;
use crate::inference::stt::transcribe::transcript::{Segment, Transcript};
use crate::persistence::stt::transcripts;
use serde::Serialize;
use std::io::{BufWriter, Write};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

pub const EVENT_STT_SEGMENTS: &str = "stt-segments";
pub const EVENT_STT_TRANSCRIBE_PROGRESS: &str = "stt-transcribe-progress";

const WHISPER_BASE: &str = "http://127.0.0.1:8093";

#[derive(Serialize, Clone)]
struct SegmentsPayload {
    segments: Vec<Segment>,
}

#[derive(Serialize, Clone)]
struct ProgressPayload {
    processed_secs: f64,
    total_secs: f64,
}

/// Bridges the Tauri-free `TranscribeSink` to app events — the **only** place
/// `AppHandle` touches STT transcription (mirrors `TauriBatchSink`).
struct TauriTranscribeSink {
    app: AppHandle,
}

impl TranscribeSink for TauriTranscribeSink {
    fn segments(&self, segments: &[Segment]) {
        log_emit(&self.app, EVENT_STT_SEGMENTS, SegmentsPayload { segments: segments.to_vec() });
    }
    fn progress(&self, processed_secs: f64, total_secs: f64) {
        log_emit(&self.app, EVENT_STT_TRANSCRIBE_PROGRESS, ProgressPayload { processed_secs, total_secs });
    }
}

fn transcripts_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app.path().app_config_dir().map_err(|e| AppError::Io(e.to_string()))?.join("transcripts"))
}

fn scratch_dir(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(app.path().app_config_dir().map_err(|e| AppError::Io(e.to_string()))?.join("stt_scratch"))
}

/// Friendly model label from its path (e.g. `ggml-tiny.en.bin`).
fn model_label(model_path: &str) -> String {
    Path::new(model_path).file_name().and_then(|s| s.to_str()).unwrap_or(model_path).to_string()
}

/// Transcribe an audio file with the **running whisper.cpp** server, streaming
/// segments to the frontend and persisting the canonical `Transcript`. mlx-audio
/// transcription via whichever STT server the app owns: whisper.cpp if it's
/// running, else mlx-audio (its per-request model comes from `model`). With no
/// STT server running, a clear notice (not a crash).
#[tauri::command]
pub async fn transcribe_audio(
    app: AppHandle,
    stt: tauri::State<'_, SttServerState>,
    mlx_stt: tauri::State<'_, MlxSttServerState>,
    path: String,
    id: String,
    model: Option<String>,
) -> Result<Transcript, AppError> {
    let sink = TauriTranscribeSink { app: app.clone() };
    // whisper.cpp takes precedence (the same order as the engine resolver); its
    // model is the running server's, mlx-audio's is the per-request `model`.
    let transcript = if let Some(model_path) = stt.running_model() {
        run_transcribe(
            SttTranscribeEngine::WhisperCpp,
            WHISPER_BASE,
            Path::new(&path),
            &model_label(&model_path),
            &id,
            &sink,
        )
        .await?
    } else if mlx_stt.is_running() {
        let port = mlx_stt
            .port()
            .ok_or_else(|| AppError::Validation("the mlx-audio server isn't ready yet".into()))?;
        let repo = model.filter(|m| !m.trim().is_empty()).ok_or_else(|| {
            AppError::Validation("select an mlx-audio model to transcribe with".into())
        })?;
        // mlx-audio resolves `model` as a local path OR an HF repo id, but our
        // snapshots live under ~/.quantamind/mlx-stt — NOT the HF cache — so hand it
        // the on-disk directory. Passing the bare repo id made mlx-audio look in the
        // HF cache (empty) and fail to find the downloaded model.
        let model_dir = mlx_model_dir(&mlx_stt_dir(), &repo);
        if !model_dir.exists() {
            return Err(AppError::Validation(format!(
                "the mlx-audio model {repo} isn't installed — download it in the Speech-to-Text tab first."
            )));
        }
        let mut t = run_transcribe(
            SttTranscribeEngine::MlxAudio,
            &format!("http://127.0.0.1:{port}"),
            Path::new(&path),
            &model_dir.to_string_lossy(),
            &id,
            &sink,
        )
        .await?;
        // Label the artifact with the friendly repo, not the on-disk path.
        t.model = repo;
        t
    } else {
        return Err(AppError::Validation(
            "no STT server is running — start whisper.cpp or mlx-audio first".into(),
        ));
    };
    // Persist only on a complete run (save() refuses incomplete).
    transcripts::save(&transcripts_dir(&app)?, &transcript)?;
    Ok(transcript)
}

/// Write captured WAV bytes to a scratch file via `BufWriter`; the returned path
/// is the atomic "ready-to-transcribe" signal. Shared by the (Rust cpal) mic
/// capture's stop and any caller handing over WAV bytes.
pub(crate) fn write_scratch_wav(app: &AppHandle, bytes: &[u8]) -> AppResult<String> {
    let dir = scratch_dir(app)?;
    std::fs::create_dir_all(&dir).map_err(|e| AppError::Io(e.to_string()))?;
    let path = dir.join(format!("{}.wav", Uuid::new_v4()));
    let f = std::fs::File::create(&path).map_err(|e| AppError::Io(e.to_string()))?;
    let mut w = BufWriter::new(f);
    w.write_all(bytes).map_err(|e| AppError::Io(e.to_string()))?;
    w.flush().map_err(|e| AppError::Io(e.to_string()))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Reload a persisted transcript by id — the on-disk artifact is the source of
/// truth (frontend transcript state is transient).
#[tauri::command]
pub fn load_transcript(app: AppHandle, id: String) -> Result<Option<Transcript>, AppError> {
    transcripts::load(&transcripts_dir(&app)?, &id)
}

/// Best-effort clear of the recording scratch dir (call on startup).
pub fn clear_scratch(app: &AppHandle) {
    if let Ok(dir) = scratch_dir(app) {
        let _ = std::fs::remove_dir_all(dir);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn model_label_is_the_file_name() {
        assert_eq!(model_label("/a/b/ggml-tiny.en.bin"), "ggml-tiny.en.bin");
        assert_eq!(model_label("bare"), "bare");
    }

    #[test]
    fn payloads_serialize_with_expected_keys() {
        let j = serde_json::to_string(&ProgressPayload { processed_secs: 1.0, total_secs: 2.0 }).unwrap();
        assert!(j.contains("\"processed_secs\":1.0") && j.contains("\"total_secs\":2.0"));
        let s = serde_json::to_string(&SegmentsPayload { segments: vec![] }).unwrap();
        assert_eq!(s, "{\"segments\":[]}");
    }
}
