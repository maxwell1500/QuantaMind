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

/// One-time spawn readout for the running llama-server. llama.cpp loads the model
/// once at spawn and keeps it resident, so this is NOT a per-request phase: it's
/// the model's on-disk footprint and the wall-clock it took to become ready.
/// `model_bytes` is `None` if the GGUF can't be stat'd; `load_ms` is the
/// spawn→`/health`-ready window (coarse — bounded by the 500ms readiness poll).
#[derive(Serialize, Clone, Copy, Debug, PartialEq)]
pub struct SpawnReadout {
    pub model_bytes: Option<u64>,
    pub load_ms: u64,
}

struct RunningServer {
    child: Child,
    model_path: String,
    readout: Option<SpawnReadout>,
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
        *self.inner.lock_recover() = Some(RunningServer { child, model_path, readout: None });
    }

    /// Record the spawn readout once the server is ready. No-op if nothing is
    /// running, so a failed start never leaves a fabricated number.
    pub fn set_readout(&self, readout: SpawnReadout) {
        if let Some(s) = self.inner.lock_recover().as_mut() {
            s.readout = Some(readout);
        }
    }

    /// The current server's spawn readout — `None` when no server is up or it
    /// never became ready.
    pub fn readout(&self) -> Option<SpawnReadout> {
        self.inner.lock_recover().as_ref().and_then(|s| s.readout)
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
