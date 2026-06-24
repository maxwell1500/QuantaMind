use crate::inference::backend::endpoint::MLX_SERVER;
use std::sync::atomic::{AtomicU16, Ordering};

/// The port the app-managed `mlx_lm.server` is listening on, or 0 when we aren't
/// running one. A process-global because there is exactly one managed MLX
/// server and `inference/` can't read Tauri state — the command layer sets it on
/// start and clears it on stop/reap, and health/discovery/dispatch read it here.
static MLX_PORT: AtomicU16 = AtomicU16::new(0);

pub fn set_mlx_port(port: u16) {
    MLX_PORT.store(port, Ordering::Relaxed);
}

pub fn clear_mlx_port() {
    MLX_PORT.store(0, Ordering::Relaxed);
}

/// The MLX endpoint: the managed server's dynamic port when set, else the
/// `:8082` default for a manually-run server.
pub fn mlx_endpoint() -> String {
    match MLX_PORT.load(Ordering::Relaxed) {
        0 => MLX_SERVER.to_string(),
        p => format!("http://127.0.0.1:{p}"),
    }
}

/// Serializes tests that touch the process-global port (here + the MLX server
/// state tests), since cargo runs them in parallel within one binary.
#[cfg(test)]
pub static PORT_TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_to_8082_then_reflects_a_set_port_then_clears() {
        let _g = PORT_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
        clear_mlx_port();
        assert_eq!(mlx_endpoint(), MLX_SERVER);
        set_mlx_port(8083);
        assert_eq!(mlx_endpoint(), "http://127.0.0.1:8083");
        clear_mlx_port();
        assert_eq!(mlx_endpoint(), MLX_SERVER);
    }
}
