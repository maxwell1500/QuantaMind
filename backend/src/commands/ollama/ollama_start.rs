use crate::commands::ollama::ollama_runtime::{
    is_reachable, kill_serve, resolve_ollama, spawn_serve, wait_until_ready,
    PROBE_TIMEOUT_MS,
};
use crate::errors::AppError;
use crate::sync::MutexExt;
use serde::Serialize;
use std::sync::Mutex;

pub const INSTALL_URL: &str = "https://ollama.com/download";
pub const READY_TIMEOUT_MSG: &str =
    "Ollama started but didn't become reachable within 10 seconds.";

#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum OllamaStartResult {
    AlreadyRunning,
    Started { pid: u32 },
    NotInstalled { install_url: String },
    StartFailed { error: String },
}

#[derive(Default)]
pub struct OllamaStartState {
    in_progress: Mutex<bool>,
}

#[tauri::command]
pub async fn start_ollama(
    state: tauri::State<'_, OllamaStartState>,
) -> Result<OllamaStartResult, AppError> {
    {
        let mut g = state.in_progress.lock_recover();
        if *g {
            return Ok(OllamaStartResult::AlreadyRunning);
        }
        *g = true;
    }
    let result = start_ollama_inner().await;
    *state.in_progress.lock_recover() = false;
    Ok(result)
}

async fn start_ollama_inner() -> OllamaStartResult {
    if is_reachable(PROBE_TIMEOUT_MS).await {
        return OllamaStartResult::AlreadyRunning;
    }
    let Some(bin) = resolve_ollama() else {
        return OllamaStartResult::NotInstalled { install_url: INSTALL_URL.into() };
    };
    let pid = match spawn_serve(&bin) {
        Ok(pid) => pid,
        Err(error) => return OllamaStartResult::StartFailed { error },
    };
    if wait_until_ready().await {
        OllamaStartResult::Started { pid }
    } else {
        OllamaStartResult::StartFailed { error: READY_TIMEOUT_MSG.into() }
    }
}

#[tauri::command]
pub async fn stop_ollama() -> Result<(), AppError> {
    kill_serve().map_err(AppError::Internal)
}

#[cfg(test)]
#[path = "ollama_start_tests.rs"]
mod tests;
