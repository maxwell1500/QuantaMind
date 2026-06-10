//! Gated live integration test: drives the real `whisper-server` through our own
//! runtime code (`spawn_server` -> `is_ready` -> `kill_server`).
//!
//! Skips (passes trivially) unless `QM_STT_LIVE=1` AND the binary + models exist,
//! so CI stays green without the sidecar bundled. To run it:
//!
//!   QM_STT_LIVE=1 QM_STT_MODELS=/path/to/models \
//!     cargo test --test stt_live -- --nocapture
//!
//! Expects `backend/binaries/whisper-server` (+ `libwhisper.1.dylib`) and, in
//! `$QM_STT_MODELS`, `ggml-tiny.en.bin` and `ggml-silero-v6.2.0.bin`.

use quantamind_lib::commands::stt::stt_runtime::{
    build_spawn_args, is_reachable, is_ready, kill_server, spawn_server, PORT, PROBE_TIMEOUT_MS,
};
use std::path::PathBuf;
use std::time::Duration;

#[tokio::test]
async fn whisper_server_boots_becomes_ready_and_stops_cleanly() {
    if std::env::var("QM_STT_LIVE").is_err() {
        eprintln!("stt_live: skipped (set QM_STT_LIVE=1 to run)");
        return;
    }
    let bin_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("binaries");
    if !bin_dir.join("whisper-server").exists() {
        eprintln!("stt_live: skipped (backend/binaries/whisper-server missing)");
        return;
    }
    let Ok(models) = std::env::var("QM_STT_MODELS") else {
        eprintln!("stt_live: skipped (set QM_STT_MODELS=<dir>)");
        return;
    };
    let models = PathBuf::from(models);
    let model = models.join("ggml-tiny.en.bin");
    let vad = models.join("ggml-silero-v6.2.0.bin");
    if !model.exists() || !vad.exists() {
        eprintln!("stt_live: skipped (ggml-tiny.en.bin / ggml-silero-v6.2.0.bin not in QM_STT_MODELS)");
        return;
    }

    let args = build_spawn_args(&model.to_string_lossy(), &vad.to_string_lossy(), PORT);
    let (mut child, _tail) = spawn_server(&bin_dir, &args).expect("spawn whisper-server");

    // It reaches /health == 200 (model loaded) within the readiness window.
    let mut ready = false;
    for _ in 0..60 {
        tokio::time::sleep(Duration::from_millis(500)).await;
        if is_ready(PROBE_TIMEOUT_MS).await {
            ready = true;
            break;
        }
    }
    assert!(ready, "whisper-server never became ready on :{PORT}");

    // Graceful stop releases the port (no orphan / EADDRINUSE next time).
    kill_server(&mut child).expect("kill_server");
    tokio::time::sleep(Duration::from_millis(500)).await;
    assert!(!is_reachable(PROBE_TIMEOUT_MS).await, "port still answering after kill");
}
