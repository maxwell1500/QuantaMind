use crate::commands::llama::llama_server_types::LlamaStartResult;

#[test]
fn already_running_serializes_with_status_tag() {
    let json = serde_json::to_string(&LlamaStartResult::AlreadyRunning).unwrap();
    assert_eq!(json, r#"{"status":"already_running"}"#);
}

#[test]
fn started_serializes_with_pid_and_port() {
    let json = serde_json::to_string(&LlamaStartResult::Started { pid: 42, port: 8080 }).unwrap();
    assert_eq!(json, r#"{"status":"started","pid":42,"port":8080}"#);
}

#[test]
fn not_bundled_serializes_with_note() {
    let r = LlamaStartResult::NotBundled { note: "no binary".into() };
    let json = serde_json::to_string(&r).unwrap();
    assert!(json.contains(r#""status":"not_bundled""#));
    assert!(json.contains(r#""note":"no binary""#));
}

#[test]
fn start_failed_serializes_with_error() {
    let r = LlamaStartResult::StartFailed { error: "boom".into() };
    let json = serde_json::to_string(&r).unwrap();
    assert!(json.contains(r#""status":"start_failed""#));
    assert!(json.contains(r#""error":"boom""#));
}
