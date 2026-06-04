use crate::inference::backend::backend_kind::BackendKind;

/// Default HTTP base for each backend. Ollama serves on its well-known port; the
/// bundled `llama-server` and `mlx_lm.server` sidecars each use a distinct port so
/// all can run side by side. llama-server is on **8081** (NOT 8080) so it can't be
/// shadowed by a manually-launched `mlx_lm.server`, whose default port is 8080 —
/// that collision made llama's `/health` pass while inference 404'd.
pub const OLLAMA: &str = "http://localhost:11434";
pub const LLAMA_SERVER: &str = "http://localhost:8081";
pub const MLX_SERVER: &str = "http://localhost:8082";

/// The endpoint a backend listens on by default.
pub fn default_for(kind: BackendKind) -> &'static str {
    match kind {
        BackendKind::Ollama => OLLAMA,
        BackendKind::LlamaCpp => LLAMA_SERVER,
        BackendKind::Mlx => MLX_SERVER,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ollama_llama_and_mlx_have_distinct_ports() {
        assert!(OLLAMA.ends_with(":11434"));
        assert!(LLAMA_SERVER.ends_with(":8081"));
        assert!(MLX_SERVER.ends_with(":8082"));
        assert_ne!(default_for(BackendKind::Ollama), default_for(BackendKind::LlamaCpp));
        assert_ne!(default_for(BackendKind::Mlx), default_for(BackendKind::LlamaCpp));
    }

    #[test]
    fn defaults_are_http_urls() {
        assert!(default_for(BackendKind::Ollama).starts_with("http://"));
        assert!(default_for(BackendKind::LlamaCpp).starts_with("http://"));
        assert!(default_for(BackendKind::Mlx).starts_with("http://"));
    }
}
