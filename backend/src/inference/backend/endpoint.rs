use crate::inference::backend::backend_kind::BackendKind;
use std::sync::RwLock;

pub const DEFAULT_OLLAMA: &str = "http://localhost:11434";
pub const LLAMA_SERVER: &str = "http://localhost:8081";
pub const MLX_SERVER: &str = "http://localhost:8082";

pub const WHISPER_SERVER: &str = "http://localhost:8093";

static OLLAMA_EP: RwLock<Option<String>> = RwLock::new(None);

pub fn init_ollama_endpoint(configured: Option<&str>) {
    let ep = resolve_ollama_endpoint(configured);
    *OLLAMA_EP.write().unwrap() = Some(ep);
}

pub fn update_ollama_endpoint(ep: &str) {
    let resolved = if ep.trim().is_empty() {
        resolve_ollama_endpoint(None)
    } else if ep.starts_with("http://") || ep.starts_with("https://") {
        ep.trim().to_string()
    } else {
        format!("http://{}", ep.trim())
    };
    *OLLAMA_EP.write().unwrap() = Some(resolved);
}

pub fn ollama_endpoint() -> String {
    OLLAMA_EP.read().unwrap().clone().unwrap_or_else(|| resolve_ollama_endpoint(None))
}

fn resolve_ollama_endpoint(configured: Option<&str>) -> String {
    if let Some(c) = configured {
        let c = c.trim();
        if !c.is_empty() {
            if c.starts_with("http://") || c.starts_with("https://") {
                return c.to_string();
            }
            return format!("http://{c}");
        }
    }
    if let Ok(host) = std::env::var("OLLAMA_HOST") {
        let h = host.trim();
        if !h.is_empty() {
            if h.starts_with("http://") || h.starts_with("https://") {
                return h.to_string();
            }
            return format!("http://{h}");
        }
    }
    DEFAULT_OLLAMA.to_string()
}

pub fn default_for(kind: BackendKind) -> &'static str {
    match kind {
        BackendKind::Ollama => DEFAULT_OLLAMA,
        BackendKind::LlamaCpp => LLAMA_SERVER,
        BackendKind::Mlx => MLX_SERVER,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ollama_llama_and_mlx_have_distinct_ports() {
        assert!(DEFAULT_OLLAMA.ends_with(":11434"));
        assert!(LLAMA_SERVER.ends_with(":8081"));
        assert!(MLX_SERVER.ends_with(":8082"));
        assert_ne!(default_for(BackendKind::Ollama), default_for(BackendKind::LlamaCpp));
        assert_ne!(default_for(BackendKind::Mlx), default_for(BackendKind::LlamaCpp));
    }

    #[test]
    fn whisper_port_is_distinct_and_clear_of_the_mlx_scan_range() {
        assert!(WHISPER_SERVER.ends_with(":8093"));
        assert!(WHISPER_SERVER.starts_with("http://"));
        for ep in [DEFAULT_OLLAMA, LLAMA_SERVER, MLX_SERVER] {
            assert_ne!(WHISPER_SERVER, ep);
        }
        // 8093 is above MLX's dynamic probe window 8082..=8092, so the two
        // sidecars never contend for a port.
        for p in 8082..=8092 {
            assert!(!WHISPER_SERVER.ends_with(&format!(":{p}")));
        }
    }

    #[test]
    fn defaults_are_http_urls() {
        assert!(default_for(BackendKind::Ollama).starts_with("http://"));
        assert!(default_for(BackendKind::LlamaCpp).starts_with("http://"));
        assert!(default_for(BackendKind::Mlx).starts_with("http://"));
    }
}
