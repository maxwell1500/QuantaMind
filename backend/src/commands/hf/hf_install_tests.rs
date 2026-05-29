use super::*;

#[test]
fn only_ollama_imports_the_downloaded_gguf() {
    assert!(imports_into_ollama(BackendKind::Ollama));
    assert!(!imports_into_ollama(BackendKind::LlamaCpp));
}
