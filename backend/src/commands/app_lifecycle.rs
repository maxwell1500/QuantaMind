use crate::commands::llama::llama_server_types::LlamaServerState;
use crate::commands::mlx::mlx_server_types::MlxServerState;
use crate::commands::stt::mlx::mlx_stt_server_types::MlxSttServerState;
use crate::commands::stt::stt_server_types::SttServerState;
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, Signal, System};
use tauri::{AppHandle, Manager, RunEvent};

/// Our private app dir — a server process whose command line references it is one
/// of ours, never a stranger's (a user would never point a hand-run server here).
const OUR_MARKER: &str = ".quantamind";
/// The server binaries we spawn (native sidecars + the python MLX servers).
const SERVER_BINS: &[&str] = &["whisper-server", "llama-server", "mlx_audio.server", "mlx_lm.server"];

/// True for an **orphaned QuantaMind sidecar**: its command line names one of our
/// servers AND references our private dir. Conservative on purpose — we never kill
/// a process we can't positively identify as ours.
fn is_our_server_cmd(cmd: &str) -> bool {
    cmd.contains(OUR_MARKER) && SERVER_BINS.iter().any(|b| cmd.contains(b))
}

/// Reap the four app-managed servers (our tracked children). Idempotent.
fn reap_managed(app: &AppHandle) {
    if let Err(e) = app.state::<MlxServerState>().kill_all_servers() {
        eprintln!("mlx reap failed: {e}");
    }
    if let Err(e) = app.state::<LlamaServerState>().stop() {
        eprintln!("llama reap failed: {e}");
    }
    if let Err(e) = app.state::<SttServerState>().stop() {
        eprintln!("whisper reap failed: {e}");
    }
    if let Err(e) = app.state::<MlxSttServerState>().kill_all_servers() {
        eprintln!("mlx-stt reap failed: {e}");
    }
}

/// Reap spawned servers when the app quits gracefully (Cmd+Q → `ExitRequested`).
/// Tauri does not kill child processes on exit, so without this a server lingers
/// holding unified memory and its port.
pub fn reap_on_exit(app: &AppHandle, event: RunEvent) {
    if let RunEvent::ExitRequested { .. } = event {
        reap_managed(app);
    }
}

/// Kill **orphaned** sidecars a previous instance left behind when it died without
/// reaping — a crash or SIGKILL (e.g. a `tauri dev` rebuild) where no in-process
/// hook can run, so the next launch would hit a held port (EADDRINUSE). Matched by
/// the conservative our-server signature, so a user's own server is never touched.
/// Skips our own PID. Returns the count killed.
pub fn sweep_orphans() -> usize {
    let mut sys = System::new();
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::everything());
    let me = std::process::id();
    let mut killed = 0;
    for proc in sys.processes().values() {
        if proc.pid().as_u32() == me {
            continue;
        }
        let cmd = proc.cmd().iter().map(|s| s.to_string_lossy()).collect::<Vec<_>>().join(" ");
        if is_our_server_cmd(&cmd) {
            eprintln!("[reap] killing orphaned QuantaMind server: {cmd}");
            if proc.kill_with(Signal::Term).is_none() {
                proc.kill();
            }
            killed += 1;
        }
    }
    killed
}

/// Install a unix signal handler so SIGINT/SIGTERM (Ctrl+C, `kill`, a dev-tool
/// restart) reaps our servers before the process exits — `RunEvent::ExitRequested`
/// does NOT fire on a signal, which is how sidecars get orphaned in development.
#[cfg(unix)]
pub fn install_signal_reaper(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        use tokio::signal::unix::{signal, SignalKind};
        let (mut term, mut intr) = match (signal(SignalKind::terminate()), signal(SignalKind::interrupt())) {
            (Ok(t), Ok(i)) => (t, i),
            _ => return,
        };
        tokio::select! {
            _ = term.recv() => {}
            _ = intr.recv() => {}
        }
        eprintln!("[reap] termination signal — stopping servers");
        reap_managed(&app);
        std::process::exit(0);
    });
}

#[cfg(not(unix))]
pub fn install_signal_reaper(_app: AppHandle) {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_our_orphaned_servers_only() {
        // The real orphan this fix targets.
        assert!(is_our_server_cmd(
            "/opt/homebrew/bin/whisper-server -m /Users/x/.quantamind/stt/ggml-medium.en-q5_0.bin --host 127.0.0.1 --port 8093 --vad"
        ));
        assert!(is_our_server_cmd("llama-server -m /Users/x/.quantamind/gguf/phi.gguf --port 8081"));
        // A user's own whisper-server, NOT pointed at our private dir → never touched.
        assert!(!is_our_server_cmd("/opt/homebrew/bin/whisper-server -m /Users/x/models/base.bin --port 9000"));
        // Our dir but not one of our servers (e.g. a file browser) → not a server.
        assert!(!is_our_server_cmd("/usr/bin/grep -r foo /Users/x/.quantamind"));
        // Unrelated processes.
        assert!(!is_our_server_cmd("/usr/bin/python3 train.py"));
        assert!(!is_our_server_cmd("ollama serve"));
    }
}
