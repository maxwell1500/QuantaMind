use crate::inference::mlx::server::mlx_endpoint::{clear_mlx_port, set_mlx_port};
use crate::inference::mlx::server::mlx_runtime::kill_server;
use crate::inference::mlx::server::mlx_stderr::Phase;
use crate::sync::MutexExt;
use serde::Serialize;
use std::collections::VecDeque;
use std::process::Child;
use std::sync::{Arc, Mutex};

/// Outcome of `start_mlx_server`, tagged by `status` so the frontend branches
/// without positional decoding (mirrors `LlamaStartResult`).
#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum MlxStartResult {
    AlreadyRunning,
    Started { pid: u32, port: u16 },
    NotFound,
    NoFreePort,
    StartFailed { error: String },
}

/// Live status, polled by the UI. `Ready` is decided by the health probe, not
/// here; this reports liveness + the stderr-derived phase, or the death reason.
#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum MlxServerStatus {
    Stopped,
    Running { phase: Phase, repo: String },
    Exited { code: Option<i32>, stderr_tail: String },
}

pub struct Running {
    pub child: Child,
    pub repo: String,
    pub phase: Arc<Mutex<Phase>>,
    pub tail: Arc<Mutex<VecDeque<String>>>,
}

/// The single app-managed `mlx_lm.server`. A new model stops the previous one.
#[derive(Default)]
pub struct MlxServerState {
    inner: Mutex<Option<Running>>,
}

impl MlxServerState {
    pub fn is_repo(&self, repo: &str) -> bool {
        self.inner.lock_recover().as_ref().is_some_and(|r| r.repo == repo)
    }

    pub fn store(&self, running: Running, port: u16) {
        set_mlx_port(port);
        *self.inner.lock_recover() = Some(running);
    }

    /// Kill and forget the running server, if any. Idempotent — used by `stop`
    /// and the app-exit reap hook. Clears the endpoint port.
    pub fn kill_all_servers(&self) -> Result<(), String> {
        let running = self.inner.lock_recover().take();
        clear_mlx_port();
        if let Some(mut r) = running {
            kill_server(&mut r.child)?;
        }
        Ok(())
    }

    /// Liveness + phase, or the exit code + stderr tail when the child has died.
    pub fn status(&self) -> MlxServerStatus {
        let mut guard = self.inner.lock_recover();
        let Some(r) = guard.as_mut() else { return MlxServerStatus::Stopped };
        match r.child.try_wait() {
            Ok(Some(code)) => MlxServerStatus::Exited {
                code: code.code(),
                stderr_tail: r.tail.lock_recover().iter().cloned().collect::<Vec<_>>().join("\n"),
            },
            _ => MlxServerStatus::Running {
                phase: *r.phase.lock_recover(),
                repo: r.repo.clone(),
            },
        }
    }
}

/// Backstop: `std::process::Child` detaches (does not kill) on drop, so reap
/// explicitly when the managed state is torn down. The exit hook in `lib.rs` is
/// the primary path; this covers other teardown.
impl Drop for MlxServerState {
    fn drop(&mut self) {
        let _ = self.kill_all_servers();
    }
}

#[cfg(test)]
#[path = "mlx_server_types_tests.rs"]
mod tests;
