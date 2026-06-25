//! The OCR tool's backend commands: read a user-selected file's bytes (→ base64), stream a live
//! OCR extraction from a vision model (token-by-token Tauri events), export the text, and stop a
//! run. Reuses the vision plumbing (`GenerateSpec.images`, `stream_generate`, `probe_supports_vision`)
//! + the proven `make_token_handler` streaming pattern from `run_prompt`. File I/O stays in Rust.

use crate::errors::AppError;
use crate::inference::backend::backend::InferenceBackend;
use crate::inference::backend::backend_kind::BackendKind;
use crate::inference::backend::endpoint;
use crate::inference::generate::generate_options::GenerateOptions;
use crate::inference::generate::generate_spec::GenerateSpec;
use crate::inference::ollama::ollama_backend::OllamaBackend;
use crate::inference::ollama::ollama_show::probe_supports_vision;
use crate::inference::token_handler::make_token_handler;
use crate::metrics::timing::RunTiming;
use crate::persistence::files;
use crate::sync::MutexExt;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Emitter;
use tokio_util::sync::CancellationToken;

pub const EVENT_OCR_TOKEN: &str = "ocr-token";
pub const EVENT_OCR_DONE: &str = "ocr-done";
pub const EVENT_OCR_CANNOT_PROCESS: &str = "ocr-cannot-process";

const OCR_SYSTEM: &str = "You are an OCR engine. Transcribe ALL visible text in the image exactly, preserving reading order. Output ONLY the transcribed text — no commentary, no markdown.";
const OCR_PROMPT: &str = "Extract all text from this image.";
/// Hard per-page cap so a repetition-collapse (greedy decoding latching onto a highly repetitive
/// page) stops instead of looping forever — but generous enough that a genuinely dense page (e.g. a
/// full-page table) isn't truncated mid-content.
const OCR_MAX_TOKENS: u32 = 8192;

/// Holds the in-flight OCR run's cancel token (one at a time; a new run cancels the previous).
#[derive(Default)]
pub struct OcrRunState {
    current: Mutex<Option<CancellationToken>>,
}

#[derive(serde::Serialize, Clone)]
struct OcrTokenPayload {
    request_id: String,
    text: String,
}
#[derive(serde::Serialize, Clone)]
struct OcrRequestPayload {
    request_id: String,
    model: String,
}

/// Read a user-selected image/PDF (path) → base64. File I/O in Rust; the frontend decodes it to a
/// data-URI (display is off in the OCR tool) or a Uint8Array (PDF.js), and sends page images here.
#[tauri::command]
pub fn read_file_base64(source_path: PathBuf) -> Result<String, AppError> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    Ok(STANDARD.encode(files::read_bytes_capped(&source_path, files::MAX_FILE_BYTES)?))
}

/// Write the extracted text to a file (the Export action). Capped; file I/O in Rust.
#[tauri::command]
pub fn write_text_file(path: PathBuf, content: String) -> Result<(), AppError> {
    files::write_text_capped(&path, &content)
}

/// Whether a model can read images (vision). Probed ONCE per run (the frontend gates the whole
/// document up front) — never per page, which would false-negative while Ollama is busy loading or
/// finishing the previous page. Vision is Ollama-only.
#[tauri::command]
pub async fn ocr_model_supports_vision(model: String) -> Result<bool, AppError> {
    let ep = endpoint::default_for(BackendKind::Ollama).to_string();
    Ok(probe_supports_vision(&ep, &model).await)
}

/// Stream a live OCR extraction of ONE base64 image. Emits `ocr-token` per chunk and `ocr-done` at
/// the end, tagged with `request_id` (the page id) so the UI routes them. The caller has already
/// gated the model via `ocr_model_supports_vision`, so this just runs. Capped at `OCR_MAX_TOKENS`.
#[tauri::command]
pub async fn run_ocr_live(
    app: tauri::AppHandle,
    state: tauri::State<'_, OcrRunState>,
    model: String,
    image_b64: String,
    request_id: String,
) -> Result<(), AppError> {
    let ep = endpoint::default_for(BackendKind::Ollama).to_string();
    let token = CancellationToken::new();
    {
        let mut guard = state.current.lock_recover();
        if let Some(prev) = guard.take() {
            prev.cancel();
        }
        *guard = Some(token.clone());
    }

    let timing = Arc::new(Mutex::new(RunTiming::start()));
    let emit_app = app.clone();
    let rid = request_id.clone();
    let handler = make_token_handler(
        move |t| {
            emit_app
                .emit(EVENT_OCR_TOKEN, OcrTokenPayload { request_id: rid.clone(), text: t.to_string() })
                .map_err(|_| ())
        },
        token.clone(),
        timing.clone(),
    );

    let spec = GenerateSpec {
        model: model.clone(),
        prompt: OCR_PROMPT.to_string(),
        system: Some(OCR_SYSTEM.to_string()),
        options: Some(GenerateOptions { temperature: Some(0.0), num_predict: Some(OCR_MAX_TOKENS), ..Default::default() }),
        keep_alive: None,
        images: Some(vec![image_b64]),
    };
    let result = OllamaBackend::new(ep).generate(&spec, token.clone(), handler).await;
    *state.current.lock_recover() = None;

    if result.is_ok() && !token.is_cancelled() {
        app.emit(EVENT_OCR_DONE, OcrRequestPayload { request_id, model })
            .map_err(|e| AppError::Internal(e.to_string()))?;
    }
    result.map(|_| ())
}

/// Cancel the in-flight OCR run (the Stop button).
#[tauri::command]
pub fn stop_ocr(state: tauri::State<'_, OcrRunState>) -> Result<(), AppError> {
    if let Some(token) = state.current.lock_recover().take() {
        token.cancel();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "Live: streaming OCR of a bundled image via the vision model (the run_ocr_live core)"]
    async fn live_streaming_ocr_extracts_image_text() {
        use crate::inference::eval::vision::scenarios::image_base64;
        let b64 = image_base64("receipt").unwrap();
        let spec = GenerateSpec {
            model: "qwen3.5:9b".into(),
            prompt: OCR_PROMPT.into(),
            system: Some(OCR_SYSTEM.into()),
            options: Some(GenerateOptions { temperature: Some(0.0), ..Default::default() }),
            keep_alive: None,
            images: Some(vec![b64]),
        };
        let mut chunks = 0usize;
        let mut out = String::new();
        OllamaBackend::new(endpoint::default_for(BackendKind::Ollama).to_string())
            .generate(&spec, CancellationToken::new(), |t| {
                chunks += 1;
                out.push_str(t);
            })
            .await
            .unwrap();
        eprintln!("OCR-STREAM: chunks={chunks} out={out:?}");
        assert!(chunks >= 1, "the OCR output must arrive as ≥1 streamed chunk");
        assert!(out.to_lowercase().contains("42"), "must read the $42.00 total; got {out:?}");
    }
}
