use crate::commands::stt::stt_runtime::kill_server;
use crate::sync::MutexExt;
use serde::Serialize;
use std::collections::VecDeque;
use std::process::Child;
use std::sync::{Arc, Mutex};

/// Outcome of `start_whisper_server`, tagged by `status` so the frontend
/// branches without positional decoding (mirrors `LlamaStartResult`). The
/// gating variants each carry a `note` telling the user exactly what to fix.
#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum SttStartResult {
    AlreadyRunning,
    Started { pid: u32, port: u16 },
    NotBundled { note: String },
    ModelMissing { note: String },
    VadMissing { note: String },
    /// A foreign process holds the STT port — fatal, never adopted (R2).
    PortConflict { note: String },
    StartFailed { error: String, stderr_tail: String },
}

pub struct Running {
    pub child: Child,
    /// Absolute path passed as `-m` — also the ownership/identity key.
    pub model_path: String,
    pub vad_path: String,
    pub tail: Arc<Mutex<VecDeque<String>>>,
}

/// The single app-managed `whisper-server`. A new model stops the previous one
/// (`future-considerations.md` tracks multi-server).
#[derive(Default)]
pub struct SttServerState {
    inner: Mutex<Option<Running>>,
}

impl SttServerState {
    pub fn is_model(&self, model_path: &str) -> bool {
        self.inner.lock_recover().as_ref().is_some_and(|r| r.model_path == model_path)
    }

    /// Whether *our* stored child is still alive. This is the R2 ownership truth:
    /// the port being reachable is not enough — a reachable port with no live
    /// child of ours is a foreign process, not our server.
    pub fn is_alive(&self) -> bool {
        let mut guard = self.inner.lock_recover();
        match guard.as_mut() {
            Some(r) => matches!(r.child.try_wait(), Ok(None)),
            None => false,
        }
    }

    pub fn store(
        &self,
        child: Child,
        model_path: String,
        vad_path: String,
        tail: Arc<Mutex<VecDeque<String>>>,
    ) {
        *self.inner.lock_recover() = Some(Running { child, model_path, vad_path, tail });
    }

    /// The captured stderr tail (death diagnosis), or empty if nothing running.
    pub fn tail_snapshot(&self) -> String {
        self.inner
            .lock_recover()
            .as_ref()
            .map(|r| r.tail.lock_recover().iter().cloned().collect::<Vec<_>>().join("\n"))
            .unwrap_or_default()
    }

    /// Kill and forget the running server, if any. Idempotent — used by `stop`,
    /// model switch, and the app-exit reap hook. Graceful-then-hard via
    /// `kill_server`.
    pub fn stop(&self) -> Result<(), String> {
        let running = self.inner.lock_recover().take();
        if let Some(mut r) = running {
            kill_server(&mut r.child)?;
        }
        Ok(())
    }
}

/// Backstop: `std::process::Child` detaches (does not kill) on drop, so reap
/// explicitly when the managed state is torn down. The exit hook in `lib.rs` is
/// the primary path; this covers other teardown (mirrors `MlxServerState`).
impl Drop for SttServerState {
    fn drop(&mut self) {
        let _ = self.stop();
    }
}

#[cfg(test)]
#[path = "stt_server_types_tests.rs"]
mod tests;
