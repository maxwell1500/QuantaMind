use crate::commands::llama::llama_runtime::kill_server;
use crate::sync::MutexExt;
use serde::Serialize;
use std::process::Child;
use std::sync::Mutex;

/// Outcome of a `start_llama_server` call. Tagged by `status` so the frontend
/// can branch without positional decoding (mirrors `OllamaStartResult`).
#[derive(Serialize, Debug, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum LlamaStartResult {
    AlreadyRunning,
    Started { pid: u32, port: u16 },
    NotBundled { note: String },
    StartFailed { error: String },
}

struct RunningServer {
    child: Child,
    model_path: String,
}

/// The single active `llama-server` process. One server per loaded GGUF; a new
/// model stops the previous one (`future-considerations.md` tracks multi-server).
#[derive(Default)]
pub struct LlamaServerState {
    inner: Mutex<Option<RunningServer>>,
}

impl LlamaServerState {
    pub fn is_model(&self, model_path: &str) -> bool {
        self.inner
            .lock_recover()
            .as_ref()
            .is_some_and(|s| s.model_path == model_path)
    }

    pub fn store(&self, child: Child, model_path: String) {
        *self.inner.lock_recover() = Some(RunningServer { child, model_path });
    }

    /// Kill and forget the running server, if any. Idempotent.
    pub fn stop(&self) -> Result<(), String> {
        let running = self.inner.lock_recover().take();
        if let Some(mut s) = running {
            kill_server(&mut s.child)?;
        }
        Ok(())
    }
}
