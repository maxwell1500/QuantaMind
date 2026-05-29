use crate::commands::llama::llama_runtime::{
    build_spawn_args, is_reachable, spawn_server, wait_until_ready, PORT, PROBE_TIMEOUT_MS,
};
use crate::commands::llama::llama_server_types::{LlamaServerState, LlamaStartResult};
use crate::errors::AppError;
use std::path::PathBuf;

pub const READY_TIMEOUT_MSG: &str =
    "llama-server started but didn't become reachable within 30 seconds.";
pub const NOT_BUNDLED_MSG: &str =
    "The llama-server sidecar isn't bundled for this platform yet.";

/// Locate the bundled sidecar, placed beside the app binary at runtime.
fn resolve_llama_server() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let name = if cfg!(windows) { "llama-server.exe" } else { "llama-server" };
    let p = exe.parent()?.join(name);
    p.exists().then_some(p)
}

#[tauri::command]
pub async fn start_llama_server(
    state: tauri::State<'_, LlamaServerState>,
    model_path: String,
) -> Result<LlamaStartResult, AppError> {
    if is_reachable(PROBE_TIMEOUT_MS).await && state.is_model(&model_path) {
        return Ok(LlamaStartResult::AlreadyRunning);
    }
    state.stop().map_err(AppError::Internal)?;
    let Some(bin) = resolve_llama_server() else {
        return Ok(LlamaStartResult::NotBundled { note: NOT_BUNDLED_MSG.into() });
    };
    let child = match spawn_server(&bin, &build_spawn_args(&model_path, PORT)) {
        Ok(c) => c,
        Err(error) => return Ok(LlamaStartResult::StartFailed { error }),
    };
    let pid = child.id();
    state.store(child, model_path);
    if wait_until_ready().await {
        Ok(LlamaStartResult::Started { pid, port: PORT })
    } else {
        let _ = state.stop();
        Ok(LlamaStartResult::StartFailed { error: READY_TIMEOUT_MSG.into() })
    }
}

#[tauri::command]
pub async fn stop_llama_server(
    state: tauri::State<'_, LlamaServerState>,
) -> Result<(), AppError> {
    state.stop().map_err(AppError::Internal)
}

#[cfg(test)]
#[path = "llama_start_tests.rs"]
mod tests;
