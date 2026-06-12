use super::*;

#[test]
fn ollama_serializes_as_bare_snake_case_string() {
    let json = serde_json::to_string(&BackendKind::Ollama).unwrap();
    assert_eq!(json, "\"ollama\"");
}

#[test]
fn ollama_round_trips_through_serde() {
    let parsed: BackendKind = serde_json::from_str("\"ollama\"").unwrap();
    assert_eq!(parsed, BackendKind::Ollama);
}

#[test]
fn llama_cpp_serializes_as_snake_case_string() {
    let json = serde_json::to_string(&BackendKind::LlamaCpp).unwrap();
    assert_eq!(json, "\"llama_cpp\"");
}

#[test]
fn llama_cpp_round_trips_through_serde() {
    let parsed: BackendKind = serde_json::from_str("\"llama_cpp\"").unwrap();
    assert_eq!(parsed, BackendKind::LlamaCpp);
}

#[test]
fn mlx_serializes_as_snake_case_string() {
    let json = serde_json::to_string(&BackendKind::Mlx).unwrap();
    assert_eq!(json, "\"mlx\"");
}

#[test]
fn mlx_round_trips_through_serde() {
    let parsed: BackendKind = serde_json::from_str("\"mlx\"").unwrap();
    assert_eq!(parsed, BackendKind::Mlx);
}

#[test]
fn default_is_ollama() {
    assert_eq!(BackendKind::default(), BackendKind::Ollama);
}
