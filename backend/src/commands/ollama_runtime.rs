use reqwest::Client;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

pub const OLLAMA_TAGS_URL: &str = "http://localhost:11434/api/tags";
pub const READY_TIMEOUT_SECS: u64 = 10;
pub const POLL_INTERVAL_MS: u64 = 500;
pub const PROBE_TIMEOUT_MS: u64 = 1000;

pub async fn is_reachable(timeout_ms: u64) -> bool {
    let client = match Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    client
        .get(OLLAMA_TAGS_URL)
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
pub fn resolve_ollama() -> Option<PathBuf> {
    if let Ok(out) = Command::new("which").arg("ollama").output() {
        if out.status.success() {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !path.is_empty() {
                let p = PathBuf::from(&path);
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }
    for candidate in ["/opt/homebrew/bin/ollama", "/usr/local/bin/ollama"] {
        let p = PathBuf::from(candidate);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

#[cfg(not(target_os = "macos"))]
pub fn resolve_ollama() -> Option<PathBuf> { None }

pub const UNSUPPORTED_OS_MSG: &str =
    "Auto-start of Ollama is not yet supported on this OS — please start Ollama manually.";

#[cfg(target_os = "macos")]
pub fn spawn_serve(bin: &PathBuf) -> Result<u32, String> {
    Command::new(bin)
        .arg("serve")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map(|c| c.id())
        .map_err(|e| e.to_string())
}

#[cfg(not(target_os = "macos"))]
pub fn spawn_serve(_bin: &PathBuf) -> Result<u32, String> {
    Err(UNSUPPORTED_OS_MSG.into())
}

pub async fn wait_until_ready() -> bool {
    let attempts = (READY_TIMEOUT_SECS * 1000) / POLL_INTERVAL_MS;
    for _ in 0..attempts {
        tokio::time::sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
        if is_reachable(PROBE_TIMEOUT_MS).await {
            return true;
        }
    }
    false
}
