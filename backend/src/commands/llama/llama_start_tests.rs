use super::has_bin;
use crate::commands::llama::llama_runtime::bin_name;
use crate::commands::llama::llama_server_types::LlamaStartResult;

#[test]
fn has_bin_requires_the_binary_in_the_dir() {
    let dir = tempfile::tempdir().expect("tempdir");
    assert!(has_bin(dir.path().to_path_buf()).is_none(), "empty dir resolves to None");
    std::fs::write(dir.path().join(bin_name()), b"x").expect("write");
    assert_eq!(
        has_bin(dir.path().to_path_buf()).as_deref(),
        Some(dir.path()),
        "dir containing llama-server resolves to itself",
    );
}

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
