use quantamind_lib::commands::workspace::{load_prompt_from_file, save_prompt_to_file};
use quantamind_lib::errors::AppError;
use tempfile::tempdir;

#[test]
fn save_then_load_round_trips_byte_exact_values() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("p.yaml");
    let p = path.to_str().unwrap();
    save_prompt_to_file(p, "llama3.2:1b", "Why is the sky blue?").unwrap();
    let loaded = load_prompt_from_file(p).unwrap();
    assert_eq!(loaded.model, "llama3.2:1b");
    assert_eq!(loaded.prompt, "Why is the sky blue?");
}

#[test]
fn round_trip_preserves_unicode_quotes_and_newlines() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("p.yaml");
    let p = path.to_str().unwrap();
    let model = "phi3:mini";
    let prompt = "line 1\nline 2 — 世界 — say \"hi\" and 'bye'";
    save_prompt_to_file(p, model, prompt).unwrap();
    let loaded = load_prompt_from_file(p).unwrap();
    assert_eq!(loaded.model, model, "model must round-trip byte-exact");
    assert_eq!(loaded.prompt, prompt, "prompt must round-trip byte-exact");
}

#[test]
fn load_missing_file_returns_io_error() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("nope.yaml");
    match load_prompt_from_file(path.to_str().unwrap()) {
        Err(AppError::Io(_)) => {}
        other => panic!("expected Io err, got {other:?}"),
    }
}

#[test]
fn save_overwrites_existing_file() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("p.yaml");
    let p = path.to_str().unwrap();
    save_prompt_to_file(p, "a", "first").unwrap();
    save_prompt_to_file(p, "b", "second").unwrap();
    let loaded = load_prompt_from_file(p).unwrap();
    assert_eq!(loaded.model, "b");
    assert_eq!(loaded.prompt, "second");
}
