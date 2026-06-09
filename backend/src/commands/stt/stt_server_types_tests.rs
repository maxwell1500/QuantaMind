use super::*;
use std::process::{Command, Stdio};

fn empty_tail() -> Arc<Mutex<VecDeque<String>>> {
    Arc::new(Mutex::new(VecDeque::new()))
}

fn spawn_sleep() -> Child {
    Command::new("sleep").arg("30").stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap()
}

#[test]
fn store_then_is_model_and_is_alive_track_the_running_child() {
    let state = SttServerState::default();
    assert!(!state.is_alive(), "nothing stored");
    assert!(!state.is_model("/m/ggml-tiny.en.bin"));

    state.store(spawn_sleep(), "/m/ggml-tiny.en.bin".into(), "/m/vad.bin".into(), empty_tail());
    assert!(state.is_model("/m/ggml-tiny.en.bin"));
    assert!(!state.is_model("/m/other.bin"));
    assert!(state.is_alive(), "the stored sleep is still running");

    assert!(state.stop().is_ok());
    assert!(!state.is_alive(), "stopped");
    assert!(state.stop().is_ok(), "stop is idempotent");
}

#[test]
fn is_alive_is_false_once_the_child_exits() {
    let state = SttServerState::default();
    let quick = Command::new("true").stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap();
    state.store(quick, "/m/x.bin".into(), "/m/vad.bin".into(), empty_tail());
    std::thread::sleep(std::time::Duration::from_millis(100));
    assert!(!state.is_alive(), "a child that exited on its own is not alive");
    let _ = state.stop();
}

#[test]
fn start_result_serializes_with_snake_case_status_tags() {
    let cases = [
        (SttStartResult::AlreadyRunning, "already_running"),
        (SttStartResult::Started { pid: 42, port: 8093 }, "started"),
        (SttStartResult::NotBundled { note: "n".into() }, "not_bundled"),
        (SttStartResult::ModelMissing { note: "n".into() }, "model_missing"),
        (SttStartResult::VadMissing { note: "n".into() }, "vad_missing"),
        (SttStartResult::PortConflict { note: "n".into() }, "port_conflict"),
        (SttStartResult::StartFailed { error: "e".into(), stderr_tail: "t".into() }, "start_failed"),
    ];
    for (variant, tag) in cases {
        let json = serde_json::to_string(&variant).unwrap();
        assert!(json.contains(&format!("\"status\":\"{tag}\"")), "got {json}");
    }
}
