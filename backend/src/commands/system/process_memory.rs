use crate::sync::MutexExt;
use std::sync::{Mutex, OnceLock};
use sysinfo::{ProcessRefreshKind, ProcessesToUpdate, System};

fn system() -> &'static Mutex<System> {
    static SYS: OnceLock<Mutex<System>> = OnceLock::new();
    SYS.get_or_init(|| Mutex::new(System::new()))
}

/// Total resident memory (bytes) of all running `ollama` processes (the server
/// plus its model runner), or `None` if none are running. Sampled per run by
/// the frontend's basic leak heuristic. `.memory()` is bytes on sysinfo 0.32.
pub fn ollama_rss() -> Option<u64> {
    let mut sys = system().lock_recover();
    sys.refresh_processes_specifics(
        ProcessesToUpdate::All,
        true,
        ProcessRefreshKind::new().with_memory(),
    );
    let total: u64 = sys
        .processes()
        .values()
        .filter(|p| p.name().to_string_lossy().to_lowercase().contains("ollama"))
        .map(|p| p.memory())
        .sum();
    (total > 0).then_some(total)
}

#[tauri::command]
pub fn get_ollama_rss() -> Option<u64> {
    ollama_rss()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ollama_rss_never_panics() {
        // Value depends on whether Ollama is running; just exercise the path.
        let _ = ollama_rss();
    }
}
