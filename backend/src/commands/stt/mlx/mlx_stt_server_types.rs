use crate::inference::mlx::server::mlx_runtime::kill_server;
use crate::inference::mlx::server::mlx_stderr::Phase;
use crate::sync::MutexExt;
use serde::Serialize;
use std::collections::VecDeque;
use std::process::Child;
use std::sync::{Arc, Mutex};

/// Outcome of `start_mlx_stt_server`, tagged by `status` (mirrors
/// `MlxStartResult`). `start_failed` carries the stderr tail for diagnosis.
#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum MlxSttStartResult {
    AlreadyRunning,
    Started { pid: u32, port: u16 },
    /// mlx-audio isn't installed (`pip install mlx-audio`).
    NotFound,
    NoFreePort { note: String },
    StartFailed { error: String, stderr_tail: String },
}

/// Live status, polled by the UI. mlx-audio loads the whisper model per request,
/// so `Running` means the server is listening (ready to accept a transcription);
/// the `phase` is a coarse stderr-derived hint.
#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum MlxSttServerStatus {
    Stopped,
    Running { port: u16, phase: Phase },
    Exited { code: Option<i32>, stderr_tail: String },
}

pub struct Running {
    pub child: Child,
    pub port: u16,
    pub phase: Arc<Mutex<Phase>>,
    pub tail: Arc<Mutex<VecDeque<String>>>,
}

/// The single app-managed `mlx_audio.server` (one STT server at a time).
#[derive(Default)]
pub struct MlxSttServerState {
    inner: Mutex<Option<Running>>,
}

impl MlxSttServerState {
    /// Whether our spawned server is still alive (R2 ownership truth).
    pub fn is_running(&self) -> bool {
        matches!(
            self.inner.lock_recover().as_mut().map(|r| r.child.try_wait()),
            Some(Ok(None))
        )
    }

    pub fn port(&self) -> Option<u16> {
        self.inner.lock_recover().as_ref().map(|r| r.port)
    }

    pub fn store(&self, running: Running) {
        *self.inner.lock_recover() = Some(running);
    }

    /// Kill and forget the running server, if any. Idempotent — used by stop,
    /// engine switch, and the exit reap hook.
    pub fn kill_all_servers(&self) -> Result<(), String> {
        let running = self.inner.lock_recover().take();
        if let Some(mut r) = running {
            kill_server(&mut r.child)?;
        }
        Ok(())
    }

    pub fn status(&self) -> MlxSttServerStatus {
        let mut guard = self.inner.lock_recover();
        let Some(r) = guard.as_mut() else { return MlxSttServerStatus::Stopped };
        match r.child.try_wait() {
            Ok(Some(code)) => MlxSttServerStatus::Exited {
                code: code.code(),
                stderr_tail: r.tail.lock_recover().iter().cloned().collect::<Vec<_>>().join("\n"),
            },
            _ => MlxSttServerStatus::Running { port: r.port, phase: *r.phase.lock_recover() },
        }
    }
}

/// Backstop: `Child` detaches (does not kill) on drop, so reap explicitly when
/// the managed state is torn down (mirrors `MlxServerState`).
impl Drop for MlxSttServerState {
    fn drop(&mut self) {
        let _ = self.kill_all_servers();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::{Command, Stdio};

    fn running(child: Child, port: u16) -> Running {
        Running {
            child,
            port,
            phase: Arc::new(Mutex::new(Phase::Starting)),
            tail: Arc::new(Mutex::new(VecDeque::new())),
        }
    }

    #[test]
    fn store_then_running_then_stop_is_idempotent() {
        let state = MlxSttServerState::default();
        assert!(!state.is_running());
        let child = Command::new("sleep").arg("30").stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap();
        state.store(running(child, 8094));
        assert!(state.is_running());
        assert_eq!(state.port(), Some(8094));
        match state.status() {
            MlxSttServerStatus::Running { port, .. } => assert_eq!(port, 8094),
            s => panic!("expected Running, got {s:?}"),
        }
        assert!(state.kill_all_servers().is_ok());
        assert!(!state.is_running());
        assert!(state.kill_all_servers().is_ok(), "idempotent");
    }

    #[test]
    fn start_result_serializes_with_snake_case_status_tags() {
        let cases = [
            (MlxSttStartResult::AlreadyRunning, "already_running"),
            (MlxSttStartResult::Started { pid: 1, port: 8094 }, "started"),
            (MlxSttStartResult::NotFound, "not_found"),
            (MlxSttStartResult::NoFreePort { note: "n".into() }, "no_free_port"),
            (MlxSttStartResult::StartFailed { error: "e".into(), stderr_tail: "t".into() }, "start_failed"),
        ];
        for (v, tag) in cases {
            let j = serde_json::to_string(&v).unwrap();
            assert!(j.contains(&format!("\"status\":\"{tag}\"")), "got {j}");
        }
    }
}
