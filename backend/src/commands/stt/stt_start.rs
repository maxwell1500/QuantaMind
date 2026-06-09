use crate::commands::stt::stt_runtime::{
    bin_name, build_spawn_args, is_reachable, is_ready, spawn_server, POLL_INTERVAL_MS, PORT,
    PROBE_TIMEOUT_MS, READY_TIMEOUT_SECS,
};
use crate::commands::stt::stt_server_types::{SttServerState, SttStartResult};
use crate::errors::AppError;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::Manager;

pub const NOT_BUNDLED_MSG: &str =
    "The whisper-server sidecar isn't bundled for this platform yet.";
pub const READY_TIMEOUT_MSG: &str =
    "whisper-server started but didn't report a loaded model within 30 seconds.";

/// Directory holding `whisper-server` and its dylibs (colocated, like
/// llama-server): env override → bundled resources (prod) → source tree (dev).
fn whisper_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("QUANTAMIND_WHISPER_DIR") {
        return has_bin(PathBuf::from(p));
    }
    if let Ok(res) = app.path().resource_dir() {
        if let Some(d) = has_bin(res.join("binaries")) {
            return Some(d);
        }
    }
    #[cfg(debug_assertions)]
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dev) = exe.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
            return has_bin(dev.join("binaries"));
        }
    }
    None
}

fn has_bin(dir: PathBuf) -> Option<PathBuf> {
    dir.join(bin_name()).exists().then_some(dir)
}

/// The R2 ownership decision from the two probe facts. Pure so the truth table
/// is unit-testable without async or Tauri state.
#[derive(Debug, PartialEq)]
enum Adopt {
    /// Our live server already serves this model — nothing to do.
    AlreadyOurs,
    /// The port answers but it isn't ours — fatal, never adopt a stranger.
    Conflict,
    /// Free, or ours-but-different-model: stop-if-needed and (re)spawn.
    Proceed,
}

fn adopt_decision(ours_alive: bool, ours_model: bool, reachable: bool) -> Adopt {
    if ours_alive && ours_model {
        Adopt::AlreadyOurs
    } else if !ours_alive && reachable {
        Adopt::Conflict
    } else {
        Adopt::Proceed
    }
}

fn port_conflict_note() -> String {
    format!(
        "Something is already using the STT port {PORT}. Stop it and try again — \
         QuantaMind won't take over a process it didn't start."
    )
}

/// Pure pre-spawn gate over the resolved bundle dir + the two model paths.
/// `Ok(dir)` to proceed; `Err(result)` for a gate the user must resolve. The
/// VAD presence gate is mandatory — without it the silence-hallucination metric
/// would silently disable.
fn precheck_spawn<'a>(
    dir: Option<&'a Path>,
    model_path: &str,
    vad_path: &str,
) -> Result<&'a Path, SttStartResult> {
    let Some(dir) = dir else {
        return Err(SttStartResult::NotBundled { note: NOT_BUNDLED_MSG.into() });
    };
    if !Path::new(model_path).exists() {
        return Err(SttStartResult::ModelMissing {
            note: format!("The whisper model file is missing: {model_path}. Download it first."),
        });
    }
    if !Path::new(vad_path).exists() {
        return Err(SttStartResult::VadMissing {
            note: format!(
                "The silero VAD model is missing: {vad_path}. Re-run the download — \
                 the VAD ships together with the whisper model."
            ),
        });
    }
    Ok(dir)
}

/// Poll `/health` until the model is loaded (HTTP 200), bailing the instant our
/// child dies so a crash surfaces its stderr tail instead of a 30s wait.
async fn await_ready(state: &SttServerState) -> bool {
    let attempts = (READY_TIMEOUT_SECS * 1000) / POLL_INTERVAL_MS;
    for _ in 0..attempts {
        tokio::time::sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
        if !state.is_alive() {
            return false;
        }
        if is_ready(PROBE_TIMEOUT_MS).await {
            return true;
        }
    }
    false
}

#[tauri::command]
pub async fn start_whisper_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, SttServerState>,
    model_path: String,
    vad_path: String,
) -> Result<SttStartResult, AppError> {
    let ours_alive = state.is_alive();
    let ours_model = state.is_model(&model_path);
    let reachable = is_reachable(PROBE_TIMEOUT_MS).await;
    match adopt_decision(ours_alive, ours_model, reachable) {
        Adopt::AlreadyOurs => return Ok(SttStartResult::AlreadyRunning),
        Adopt::Conflict => return Ok(SttStartResult::PortConflict { note: port_conflict_note() }),
        Adopt::Proceed => {}
    }
    // Stop our previous (different-model or dead) server before (re)spawning.
    state.stop().map_err(AppError::Internal)?;
    let dir = whisper_dir(&app);
    let dir = match precheck_spawn(dir.as_deref(), &model_path, &vad_path) {
        Ok(d) => d.to_path_buf(),
        Err(gate) => return Ok(gate),
    };
    let (child, tail) = match spawn_server(&dir, &build_spawn_args(&model_path, &vad_path, PORT)) {
        Ok(ct) => ct,
        Err(error) => return Ok(SttStartResult::StartFailed { error, stderr_tail: String::new() }),
    };
    let pid = child.id();
    state.store(child, model_path, vad_path, tail);
    if await_ready(&state).await {
        Ok(SttStartResult::Started { pid, port: PORT })
    } else {
        let stderr_tail = state.tail_snapshot();
        let _ = state.stop();
        Ok(SttStartResult::StartFailed { error: READY_TIMEOUT_MSG.into(), stderr_tail })
    }
}

#[tauri::command]
pub async fn stop_whisper_server(
    state: tauri::State<'_, SttServerState>,
) -> Result<(), AppError> {
    state.stop().map_err(AppError::Internal)
}

#[cfg(test)]
#[path = "stt_start_tests.rs"]
mod tests;
