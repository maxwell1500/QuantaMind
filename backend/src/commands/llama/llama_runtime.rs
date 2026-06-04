use crate::inference::backend::endpoint;
use reqwest::Client;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

/// 8081, NOT 8080 — `mlx_lm.server`'s default is 8080, and a stray one there
/// would shadow our llama-server (health passes, inference 404s). See
/// `inference::backend::endpoint`.
pub const PORT: u16 = 8081;
pub const READY_TIMEOUT_SECS: u64 = 30;
pub const POLL_INTERVAL_MS: u64 = 500;
pub const PROBE_TIMEOUT_MS: u64 = 1000;

/// Probe the sidecar's `/health` endpoint.
pub async fn is_reachable(timeout_ms: u64) -> bool {
    let client = match Client::builder().timeout(Duration::from_millis(timeout_ms)).build() {
        Ok(c) => c,
        Err(_) => return false,
    };
    client
        .get(format!("{}/health", endpoint::LLAMA_SERVER))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// Arguments to launch `llama-server` for one GGUF on a fixed port. Pure, so it
/// can be asserted without spawning a process.
pub fn build_spawn_args(gguf_path: &str, port: u16) -> Vec<String> {
    vec![
        "-m".into(), gguf_path.into(),
        "--host".into(), "127.0.0.1".into(),
        "--port".into(), port.to_string(),
    ]
}

/// The `llama-server` executable file name for this platform.
pub fn bin_name() -> &'static str {
    if cfg!(windows) { "llama-server.exe" } else { "llama-server" }
}

/// Spawn `llama-server` from `dir` (which holds the binary and its dylibs),
/// returning the child so the caller owns its lifecycle. `current_dir` +
/// `DYLD_FALLBACK_LIBRARY_PATH` ensure the `@rpath`/`@loader_path` dylibs
/// resolve regardless of cwd. Killing by `Child` handle is portable across
/// macOS / Windows / Linux, unlike Ollama's macOS-only `pkill`.
pub fn spawn_server(dir: &Path, args: &[String]) -> Result<Child, String> {
    Command::new(dir.join(bin_name()))
        .args(args)
        .current_dir(dir)
        .env("DYLD_FALLBACK_LIBRARY_PATH", dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
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

/// Terminate the running server. Idempotent: killing an already-exited child is
/// treated as success (the caller wanted it stopped; it already is).
pub fn kill_server(child: &mut Child) -> Result<(), String> {
    match child.kill() {
        Ok(()) => {
            let _ = child.wait();
            Ok(())
        }
        Err(e) if e.kind() == std::io::ErrorKind::InvalidInput => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

#[cfg(test)]
#[path = "llama_runtime_tests.rs"]
mod tests;
