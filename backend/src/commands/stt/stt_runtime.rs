use crate::commands::stt::stt_stderr::spawn_stderr_reader;
use crate::inference::backend::endpoint;
use reqwest::{Client, StatusCode};
use std::collections::VecDeque;
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Fixed STT port — 8093, clear of MLX's 8082..=8092 scan range (see
/// `inference::backend::endpoint`).
pub const PORT: u16 = 8093;
pub const READY_TIMEOUT_SECS: u64 = 30;
pub const POLL_INTERVAL_MS: u64 = 500;
pub const PROBE_TIMEOUT_MS: u64 = 1000;
/// Grace period for a SIGTERM to land before the hard kill (R4).
const GRACEFUL_WAIT_MS: u64 = 2000;

fn client(timeout_ms: u64) -> Option<Client> {
    Client::builder().timeout(Duration::from_millis(timeout_ms)).build().ok()
}

async fn health_status(base: &str, timeout_ms: u64) -> Option<StatusCode> {
    let c = client(timeout_ms)?;
    c.get(format!("{base}/health")).send().await.ok().map(|r| r.status())
}

/// Readiness gate: `GET /health` returns **HTTP 200** only once whisper-server
/// has loaded the model (it answers 503 `{"status":"loading model"}` while
/// loading). Pure over `base` so it can be asserted against a mock server.
pub(crate) async fn ready_at(base: &str, timeout_ms: u64) -> bool {
    health_status(base, timeout_ms).await.map(|s| s.is_success()).unwrap_or(false)
}

/// Liveness: *any* HTTP answer (incl. 503-loading) means a server is bound to
/// the port; only a transport error means down. Used by the R2 collision check
/// to tell "up but loading" from "nothing there".
pub(crate) async fn reachable_at(base: &str, timeout_ms: u64) -> bool {
    health_status(base, timeout_ms).await.is_some()
}

/// True once the model is loaded and `/health` is 200.
pub async fn is_ready(timeout_ms: u64) -> bool {
    ready_at(endpoint::WHISPER_SERVER, timeout_ms).await
}

/// True if anything is answering on the STT port (ready or still loading).
pub async fn is_reachable(timeout_ms: u64) -> bool {
    reachable_at(endpoint::WHISPER_SERVER, timeout_ms).await
}

/// Arguments to launch `whisper-server` for one model + VAD on a fixed port.
/// Pure, so it can be asserted without spawning. Flags verified against
/// whisper.cpp `examples/server/server.cpp`.
pub fn build_spawn_args(model_path: &str, vad_path: &str, port: u16) -> Vec<String> {
    vec![
        "-m".into(), model_path.into(),
        "--host".into(), "127.0.0.1".into(),
        "--port".into(), port.to_string(),
        "--vad".into(),
        "--vad-model".into(), vad_path.into(),
    ]
}

/// The `whisper-server` executable file name for this platform.
pub fn bin_name() -> &'static str {
    if cfg!(windows) { "whisper-server.exe" } else { "whisper-server" }
}

/// Spawn `whisper-server` from `dir` (binary + dylibs colocated; `current_dir`
/// + `DYLD_FALLBACK_LIBRARY_PATH` resolve `@loader_path` libs). stderr is piped
/// into a tail ring for crash diagnosis; stdout/stdin nulled. Returns the child
/// (caller owns its lifecycle) and the shared tail.
pub fn spawn_server(
    dir: &Path,
    args: &[String],
) -> Result<(Child, Arc<Mutex<VecDeque<String>>>), String> {
    let mut child = Command::new(dir.join(bin_name()))
        .args(args)
        .current_dir(dir)
        .env("DYLD_FALLBACK_LIBRARY_PATH", dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;
    let tail = Arc::new(Mutex::new(VecDeque::new()));
    if let Some(stderr) = child.stderr.take() {
        spawn_stderr_reader(stderr, Arc::clone(&tail));
    }
    Ok((child, tail))
}

/// Poll `/health` until ready (HTTP 200), bailing the instant the child exits so
/// a crash surfaces immediately (caller reads the stderr tail) instead of
/// waiting out the full timeout.
pub async fn wait_until_ready(child: &mut Child) -> bool {
    let attempts = (READY_TIMEOUT_SECS * 1000) / POLL_INTERVAL_MS;
    for _ in 0..attempts {
        tokio::time::sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
        if matches!(child.try_wait(), Ok(Some(_))) {
            return false;
        }
        if is_ready(PROBE_TIMEOUT_MS).await {
            return true;
        }
    }
    false
}

#[cfg(unix)]
fn request_graceful_stop(pid: u32) {
    let _ = Command::new("kill")
        .arg("-TERM")
        .arg(pid.to_string())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
}

/// Terminate the running server. Graceful first (R4): SIGTERM, then up to 2 s
/// for a clean exit that releases the port, then a hard kill. The server only
/// *reads* model files, so a hard kill can never corrupt weights — graceful is
/// purely for clean teardown. Uses the system `kill` (no new crate); Windows
/// has no SIGTERM, so it falls straight through to the hard kill. Idempotent:
/// killing an already-exited child is success.
pub fn kill_server(child: &mut Child) -> Result<(), String> {
    if matches!(child.try_wait(), Ok(Some(_))) {
        return Ok(());
    }
    #[cfg(unix)]
    {
        request_graceful_stop(child.id());
        let start = Instant::now();
        while start.elapsed() < Duration::from_millis(GRACEFUL_WAIT_MS) {
            if matches!(child.try_wait(), Ok(Some(_))) {
                return Ok(());
            }
            std::thread::sleep(Duration::from_millis(100));
        }
    }
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
#[path = "stt_runtime_tests.rs"]
mod tests;
