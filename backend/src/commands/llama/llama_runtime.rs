use crate::inference::backend::endpoint;
use reqwest::Client;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, ChildStderr, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::Duration;

/// 8081, NOT 8080 — `mlx_lm.server`'s default is 8080, and a stray one there
/// would shadow our llama-server (health passes, inference 404s). See
/// `inference::backend::endpoint`.
pub const PORT: u16 = 8081;
pub const READY_TIMEOUT_SECS: u64 = 30;
pub const POLL_INTERVAL_MS: u64 = 500;
pub const PROBE_TIMEOUT_MS: u64 = 1000;

/// Health probe for the llama.cpp sidecar, in the shared `HealthStatus` shape the
/// Ollama/MLX probes return so the frontend can poll all three uniformly. No
/// version string (llama-server's `/health` reports none) → `version: None`.
#[tauri::command]
pub async fn check_llama_health() -> crate::commands::system::health::HealthStatus {
    crate::commands::system::health::HealthStatus {
        available: is_reachable(PROBE_TIMEOUT_MS).await,
        version: None,
    }
}

/// Probe the sidecar's `/health` endpoint.
pub async fn is_reachable(timeout_ms: u64) -> bool {
    let client = match Client::builder()
        .timeout(Duration::from_millis(timeout_ms))
        .build()
    {
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
///
/// `--jinja` makes the chat endpoint apply the GGUF's embedded chat template —
/// without it (and the `/v1/chat/completions` route in `inference::llama`) the
/// model never sees its trained turn structure, never emits EOS, and loops to
/// `n_predict`. `-c` pins the context window from the GGUF header so long
/// agentic transcripts don't silently overflow a too-small default.
pub fn build_spawn_args(gguf_path: &str, port: u16, ctx: u32) -> Vec<String> {
    vec![
        "-m".into(),
        gguf_path.into(),
        "--host".into(),
        "127.0.0.1".into(),
        "--port".into(),
        port.to_string(),
        "--jinja".into(),
        "-c".into(),
        ctx.to_string(),
    ]
}

/// Context window to launch with: the GGUF's own `context_length`, or a safe
/// floor when the header omits it. Kept separate from `build_spawn_args` so the
/// arg list stays a pure function of its inputs.
pub const DEFAULT_CONTEXT: u32 = 4096;

pub fn context_for(gguf_path: &str) -> u32 {
    crate::inference::gguf::gguf::inspect_gguf(Path::new(gguf_path))
        .ok()
        .and_then(|m| m.context_length)
        .unwrap_or(DEFAULT_CONTEXT)
}

/// The `llama-server` executable file name for this platform.
pub fn bin_name() -> &'static str {
    if cfg!(windows) {
        "llama-server.exe"
    } else {
        "llama-server"
    }
}

/// Spawn `llama-server` from `dir` (which holds the binary and its dylibs),
/// returning the child so the caller owns its lifecycle. `current_dir` +
/// `DYLD_FALLBACK_LIBRARY_PATH` ensure the `@rpath`/`@loader_path` dylibs
/// resolve regardless of cwd. Killing by `Child` handle is portable across
/// macOS / Windows / Linux, unlike Ollama's macOS-only `pkill`.
///
/// stderr is `piped` (not discarded) so the caller can drain it for the death
/// diagnosis — e.g. a bundled binary too old for `--jinja` exits immediately,
/// and its stderr names the rejected flag.
pub fn spawn_server(dir: &Path, args: &[String]) -> Result<Child, String> {
    Command::new(dir.join(bin_name()))
        .args(args)
        .current_dir(dir)
        .env("DYLD_FALLBACK_LIBRARY_PATH", dir)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())
}

const TAIL_CAP: usize = 20;

/// Drain the child's piped stderr on a background thread into a bounded tail
/// ring (last `TAIL_CAP` lines), returned for the death diagnosis. Draining is
/// mandatory: an undrained pipe fills and blocks the child forever. The thread
/// ends when the stream closes (process exit).
pub fn spawn_stderr_tail(stderr: ChildStderr) -> Arc<Mutex<VecDeque<String>>> {
    let tail = Arc::new(Mutex::new(VecDeque::with_capacity(TAIL_CAP)));
    let sink = tail.clone();
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            let mut t = sink.lock().unwrap_or_else(|p| p.into_inner());
            if t.len() >= TAIL_CAP {
                t.pop_front();
            }
            t.push_back(line);
        }
    });
    tail
}

pub const JINJA_UNSUPPORTED_MSG: &str =
    "The bundled llama-server is too old for the --jinja flag (it rejected it on \
     startup). Rebuild/update the bundled binary so it supports --jinja.";

/// True when the captured stderr names `--jinja` as a rejected argument — the
/// signature of a stale binary. Matched loosely (llama.cpp's arg-parser wording
/// varies across builds): the flag name plus any rejection word.
pub fn jinja_unsupported(tail: &VecDeque<String>) -> bool {
    tail.iter().any(|line| {
        let l = line.to_ascii_lowercase();
        l.contains("jinja")
            && (l.contains("invalid")
                || l.contains("unknown")
                || l.contains("unrecognized")
                || l.contains("error"))
    })
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
