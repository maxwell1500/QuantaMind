use crate::commands::llama::llama_server_types::LlamaServerState;
use crate::commands::mlx::mlx_server_types::MlxServerState;
use crate::commands::stt::mlx::mlx_stt_server_types::MlxSttServerState;
use crate::commands::stt::stt_server_types::SttServerState;
use tauri::{AppHandle, Manager, RunEvent};

/// Reap spawned servers when the app quits. Tauri does not kill child processes
/// on exit, so without this an mlx_lm.server / llama-server / whisper-server
/// lingers holding unified memory and its port (next launch would hit EADDRINUSE).
pub fn reap_on_exit(app: &AppHandle, event: RunEvent) {
    if let RunEvent::ExitRequested { .. } = event {
        if let Err(e) = app.state::<MlxServerState>().kill_all_servers() {
            eprintln!("mlx reap on exit failed: {e}");
        }
        if let Err(e) = app.state::<LlamaServerState>().stop() {
            eprintln!("llama reap on exit failed: {e}");
        }
        if let Err(e) = app.state::<SttServerState>().stop() {
            eprintln!("whisper reap on exit failed: {e}");
        }
        if let Err(e) = app.state::<MlxSttServerState>().kill_all_servers() {
            eprintln!("mlx-stt reap on exit failed: {e}");
        }
    }
}
