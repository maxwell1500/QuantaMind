use crate::inference::backend::endpoint::ollama_endpoint;
use reqwest::Client;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::time::Duration;

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
        .get(format!("{}/api/tags", ollama_endpoint()))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

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
    for candidate in [
        "/opt/homebrew/bin/ollama",
        "/usr/local/bin/ollama",
        "/usr/bin/ollama",
        "/snap/bin/ollama",
    ] {
        let p = PathBuf::from(candidate);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

pub const UNSUPPORTED_OS_MSG: &str =
    "Auto-start of Ollama is not yet supported on this OS — please start Ollama manually.";

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

pub fn kill_serve() -> Result<(), String> {
    Command::new("pkill").arg("-f").arg("ollama serve")
        .status().map(|_| ()).map_err(|e| e.to_string())
}

const KILL_GRACE_MS: u64 = 600;
const KILL_POLL_MS: u64 = 50;

fn pid_alive(pid: u32) -> bool {
    Command::new("kill")
        .arg("-0")
        .arg(pid.to_string())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn kill_pid(pid: u32) -> Result<(), String> {
    Command::new("kill").arg(pid.to_string()).stderr(Stdio::null()).status().map_err(|e| e.to_string())?;
    let attempts = KILL_GRACE_MS / KILL_POLL_MS;
    for _ in 0..attempts {
        if !pid_alive(pid) {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(KILL_POLL_MS));
    }
    if pid_alive(pid) {
        Command::new("kill").arg("-9").arg(pid.to_string()).stderr(Stdio::null()).status().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn pid_alive_tracks_a_real_process_lifecycle() {
        assert!(pid_alive(std::process::id()), "our own process is alive");
        let mut child = Command::new("true").spawn().unwrap();
        let pid = child.id();
        child.wait().unwrap();
        std::thread::sleep(Duration::from_millis(20));
        assert!(!pid_alive(pid), "a reaped child's pid is not alive");
    }

    #[test]
    fn kill_pid_on_an_already_dead_pid_is_ok() {
        let mut child = Command::new("true").spawn().unwrap();
        let pid = child.id();
        child.wait().unwrap();
        std::thread::sleep(Duration::from_millis(20));
        assert!(kill_pid(pid).is_ok());
    }
}
