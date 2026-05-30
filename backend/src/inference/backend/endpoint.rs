use crate::inference::backend::backend_kind::BackendKind;

/// Default HTTP base for each backend. Ollama serves on its well-known port;
/// the bundled `llama-server` sidecar uses a distinct port so both can run.
pub const OLLAMA: &str = "http://localhost:11434";
pub const LLAMA_SERVER: &str = "http://localhost:8080";

/// The endpoint a backend listens on by default.
pub fn default_for(kind: BackendKind) -> &'static str {
    match kind {
        BackendKind::Ollama => OLLAMA,
        BackendKind::LlamaCpp => LLAMA_SERVER,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ollama_and_llama_have_distinct_ports() {
        assert!(OLLAMA.ends_with(":11434"));
        assert!(LLAMA_SERVER.ends_with(":8080"));
        assert_ne!(default_for(BackendKind::Ollama), default_for(BackendKind::LlamaCpp));
    }

    #[test]
    fn defaults_are_http_urls() {
        assert!(default_for(BackendKind::Ollama).starts_with("http://"));
        assert!(default_for(BackendKind::LlamaCpp).starts_with("http://"));
    }
}
