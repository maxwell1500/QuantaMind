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
fn default_is_ollama() {
    assert_eq!(BackendKind::default(), BackendKind::Ollama);
}
