use crate::commands::llama::llama_runtime::{
    bin_name, build_spawn_args, is_reachable, spawn_server, wait_until_ready, PORT, PROBE_TIMEOUT_MS,
};
use crate::commands::llama::llama_server_types::{LlamaServerState, LlamaStartResult};
use crate::errors::AppError;
use std::path::PathBuf;
use tauri::Manager;

pub const READY_TIMEOUT_MSG: &str =
    "llama-server started but didn't become reachable within 30 seconds.";
pub const NOT_BUNDLED_MSG: &str =
    "The llama-server sidecar isn't bundled for this platform yet.";

/// Directory holding `llama-server` and its dylibs. They must stay colocated
/// (`@loader_path` resolves the libs), so we resolve the whole dir, not a lone
/// binary: env override → bundled resources (prod) → source tree (dev).
fn llama_dir(app: &tauri::AppHandle) -> Option<PathBuf> {
    if let Ok(p) = std::env::var("QUANTAMIND_LLAMA_DIR") {
        return has_bin(PathBuf::from(p));
    }
    if let Ok(res) = app.path().resource_dir() {
        if let Some(d) = has_bin(res.join("binaries")) {
            return Some(d);
        }
    }
    #[cfg(debug_assertions)]
    if let Ok(exe) = std::env::current_exe() {
        // target/debug/<app> → backend/binaries
        if let Some(dev) = exe.parent().and_then(|p| p.parent()).and_then(|p| p.parent()) {
            return has_bin(dev.join("binaries"));
        }
    }
    None
}

fn has_bin(dir: PathBuf) -> Option<PathBuf> {
    dir.join(bin_name()).exists().then_some(dir)
}

#[tauri::command]
pub async fn start_llama_server(
    app: tauri::AppHandle,
    state: tauri::State<'_, LlamaServerState>,
    model_path: String,
) -> Result<LlamaStartResult, AppError> {
    if is_reachable(PROBE_TIMEOUT_MS).await && state.is_model(&model_path) {
        return Ok(LlamaStartResult::AlreadyRunning);
    }
    state.stop().map_err(AppError::Internal)?;
    let Some(dir) = llama_dir(&app) else {
        return Ok(LlamaStartResult::NotBundled { note: NOT_BUNDLED_MSG.into() });
    };
    let child = match spawn_server(&dir, &build_spawn_args(&model_path, PORT)) {
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
