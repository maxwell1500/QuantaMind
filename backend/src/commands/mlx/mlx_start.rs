use crate::commands::mlx::mlx_server_types::{
    MlxServerState, MlxServerStatus, MlxStartResult, Running,
};
use crate::errors::AppError;
use crate::inference::mlx::mlx_supported;
use crate::inference::mlx::server::mlx_locate::locate;
use crate::inference::mlx::server::mlx_runtime::{build_spawn_args, find_available_port, spawn_server};
use crate::inference::mlx::server::mlx_stderr::{spawn_stderr_reader, Phase};
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

const PORT_BASE: u16 = 8082;

/// Launch `mlx_lm.server` for a local model directory (downloaded via
/// `install_mlx_model`). Does NOT block on readiness — loading weights takes a
/// moment; the frontend polls health + `mlx_server_status` instead. Guards
/// against a double-spawn (stops a different running model first), picks a free
/// port, and starts the stderr reader so phase/death are observable.
#[tauri::command]
pub async fn start_mlx_server(
    state: tauri::State<'_, MlxServerState>,
    model_path: String,
) -> Result<MlxStartResult, AppError> {
    if !mlx_supported() {
        return Ok(MlxStartResult::StartFailed {
            error: "MLX needs Apple Silicon (macOS arm64).".into(),
        });
    }
    if state.is_model(&model_path) {
        return Ok(MlxStartResult::AlreadyRunning);
    }
    state.kill_all_servers().map_err(AppError::Internal)?;
    let configured = std::env::var("QUANTAMIND_MLX_SERVER").ok();
    let Some(exe) = locate(configured.as_deref()) else {
        return Ok(MlxStartResult::NotFound);
    };
    let Some(port) = find_available_port(PORT_BASE) else {
        return Ok(MlxStartResult::NoFreePort);
    };
    let mut child = match spawn_server(&exe, &build_spawn_args(&model_path, port)) {
        Ok(c) => c,
        Err(error) => return Ok(MlxStartResult::StartFailed { error }),
    };
    let pid = child.id();
    let phase = Arc::new(Mutex::new(Phase::Starting));
    let tail = Arc::new(Mutex::new(VecDeque::new()));
    if let Some(err) = child.stderr.take() {
        spawn_stderr_reader(err, phase.clone(), tail.clone());
    }
    state.store(Running { child, model: model_path, phase, tail }, port);
    Ok(MlxStartResult::Started { pid, port })
}

#[tauri::command]
pub async fn stop_mlx_server(state: tauri::State<'_, MlxServerState>) -> Result<(), AppError> {
    state.kill_all_servers().map_err(AppError::Internal)
}

#[tauri::command]
pub fn mlx_server_status(state: tauri::State<'_, MlxServerState>) -> MlxServerStatus {
    state.status()
}
