use crate::commands::stt::mlx::mlx_stt_locate::locate;
use crate::commands::stt::mlx::mlx_stt_runtime::{build_spawn_args, find_free_port, PORT_EXHAUSTED_MSG};
use crate::commands::stt::mlx::mlx_stt_server_types::{
    MlxSttServerState, MlxSttServerStatus, MlxSttStartResult, Running,
};
use crate::errors::AppError;
use crate::inference::mlx::mlx_supported;
use crate::inference::mlx::server::mlx_runtime::spawn_server;
use crate::inference::mlx::server::mlx_stderr::{spawn_stderr_reader, Phase};
use serde::Serialize;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

const ENV_OVERRIDE: &str = "QUANTAMIND_MLX_STT_SERVER";

/// Launch `mlx_audio.server` on a free loopback port (Apple Silicon only). Does
/// NOT block on readiness — the frontend polls `mlx_stt_status`. Stops any
/// running instance first (one STT server at a time), picks a free port in the
/// MLX-STT range, and starts the stderr reader so phase/death are observable.
/// The server binds 127.0.0.1 only (offline).
#[tauri::command]
pub async fn start_mlx_stt_server(
    state: tauri::State<'_, MlxSttServerState>,
) -> Result<MlxSttStartResult, AppError> {
    if !mlx_supported() {
        return Ok(MlxSttStartResult::StartFailed {
            error: "MLX needs Apple Silicon (macOS arm64).".into(),
            stderr_tail: String::new(),
        });
    }
    if state.is_running() {
        return Ok(MlxSttStartResult::AlreadyRunning);
    }
    state.kill_all_servers().map_err(AppError::Internal)?;
    let configured = std::env::var(ENV_OVERRIDE).ok();
    let Some(exe) = locate(configured.as_deref()) else {
        return Ok(MlxSttStartResult::NotFound);
    };
    let Some(port) = find_free_port() else {
        return Ok(MlxSttStartResult::NoFreePort { note: PORT_EXHAUSTED_MSG.into() });
    };
    let mut child = match spawn_server(&exe, &build_spawn_args(port)) {
        Ok(c) => c,
        Err(error) => return Ok(MlxSttStartResult::StartFailed { error, stderr_tail: String::new() }),
    };
    let pid = child.id();
    let phase = Arc::new(Mutex::new(Phase::Starting));
    let tail = Arc::new(Mutex::new(VecDeque::new()));
    if let Some(err) = child.stderr.take() {
        spawn_stderr_reader(err, phase.clone(), tail.clone());
    }
    state.store(Running { child, port, phase, tail });
    Ok(MlxSttStartResult::Started { pid, port })
}

#[tauri::command]
pub async fn stop_mlx_stt_server(
    state: tauri::State<'_, MlxSttServerState>,
) -> Result<(), AppError> {
    state.kill_all_servers().map_err(AppError::Internal)
}

#[tauri::command]
pub fn mlx_stt_status(state: tauri::State<'_, MlxSttServerState>) -> MlxSttServerStatus {
    state.status()
}

/// Whether the mlx-audio STT engine is usable here: `supported` = Apple Silicon,
/// `found` = `mlx_audio.server` located. The frontend shows the engine only when
/// supported, and the setup card (`pip install mlx-audio`) when not found.
#[derive(Serialize, Debug, PartialEq)]
pub struct MlxSttEnv {
    pub supported: bool,
    pub found: bool,
    pub dir: Option<String>,
}

#[tauri::command]
pub fn check_mlx_stt_env() -> MlxSttEnv {
    if !mlx_supported() {
        return MlxSttEnv { supported: false, found: false, dir: None };
    }
    let configured = std::env::var(ENV_OVERRIDE).ok();
    match locate(configured.as_deref()) {
        Some(p) => MlxSttEnv { supported: true, found: true, dir: Some(p.to_string_lossy().into_owned()) },
        None => MlxSttEnv { supported: true, found: false, dir: None },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn env_serializes_the_expected_fields() {
        let j = serde_json::to_string(&MlxSttEnv { supported: true, found: false, dir: None }).unwrap();
        assert!(j.contains("\"supported\":true"));
        assert!(j.contains("\"found\":false"));
        assert!(j.contains("\"dir\":null"));
    }
}
