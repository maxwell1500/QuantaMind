use super::*;

#[test]
fn already_running_serializes_with_status_tag() {
    let json = serde_json::to_string(&OllamaStartResult::AlreadyRunning).unwrap();
    assert_eq!(json, r#"{"status":"already_running"}"#);
}

#[test]
fn started_serializes_with_pid() {
    let json = serde_json::to_string(&OllamaStartResult::Started { pid: 1234 }).unwrap();
    assert_eq!(json, r#"{"status":"started","pid":1234}"#);
}

#[test]
fn not_installed_serializes_with_install_url() {
    let r = OllamaStartResult::NotInstalled { install_url: INSTALL_URL.into() };
    let json = serde_json::to_string(&r).unwrap();
    assert!(json.contains(r#""status":"not_installed""#));
    assert!(json.contains(r#""install_url":"https://ollama.com/download""#));
}

#[test]
fn start_failed_serializes_with_error() {
    let r = OllamaStartResult::StartFailed { error: "port in use".into() };
    let json = serde_json::to_string(&r).unwrap();
    assert_eq!(json, r#"{"status":"start_failed","error":"port in use"}"#);
}
