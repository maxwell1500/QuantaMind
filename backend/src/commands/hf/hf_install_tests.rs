use super::*;

#[test]
fn ollama_import_is_required_only_on_the_ollama_backend() {
    assert!(ollama_import_required(BackendKind::Ollama));
    assert!(!ollama_import_required(BackendKind::LlamaCpp));
}
