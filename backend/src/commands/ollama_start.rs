use crate::commands::ollama_runtime::{
    is_reachable, resolve_ollama, spawn_serve, wait_until_ready, PROBE_TIMEOUT_MS,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn already_running_serializes_with_status_tag() {
        let json = serde_json::to_string(&OllamaStartResult::AlreadyRunning).unwrap();
        assert_eq!(json, r#"{"status":"already_running"}"#);
    }

    #[test]
    fn started_serializes_with_pid() {
        let json = serde_json::to_string(&OllamaStartResult::Started { pid: 1234 }).unwrap();
        assert_eq!(json, r#"{"status":"started","pid":1234}"#);
    }

    #[test]
    fn not_installed_serializes_with_install_url() {
        let r = OllamaStartResult::NotInstalled { install_url: INSTALL_URL.into() };
        let json = serde_json::to_string(&r).unwrap();
        assert!(json.contains(r#""status":"not_installed""#));
        assert!(json.contains(r#""install_url":"https://ollama.com/download""#));
    }

    #[test]
    fn start_failed_serializes_with_error() {
        let r = OllamaStartResult::StartFailed { error: "port in use".into() };
        let json = serde_json::to_string(&r).unwrap();
        assert_eq!(json, r#"{"status":"start_failed","error":"port in use"}"#);
    }
}
