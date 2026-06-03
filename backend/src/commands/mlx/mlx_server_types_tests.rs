#![cfg(unix)]
use super::*;
use crate::inference::mlx::server::mlx_endpoint::{mlx_endpoint, PORT_TEST_LOCK};
use std::process::Command;

fn running(cmd: &str, args: &[&str], model: &str) -> Running {
    let child = Command::new(cmd).args(args).spawn().expect("spawn dummy child");
    Running {
        child,
        model: model.into(),
        phase: Arc::new(Mutex::new(Phase::Starting)),
        tail: Arc::new(Mutex::new(VecDeque::from(["boom".to_string()]))),
    }
}

#[test]
fn store_sets_endpoint_then_kill_clears_and_stops() {
    let _g = PORT_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let state = MlxServerState::default();
    state.store(running("sleep", &["30"], "/m/mlx-community_X"), 8083);
    assert!(state.is_model("/m/mlx-community_X"));
    assert_eq!(mlx_endpoint(), "http://127.0.0.1:8083");
    assert!(matches!(state.status(), MlxServerStatus::Running { .. }));

    state.kill_all_servers().expect("kill");
    assert!(!state.is_model("/m/mlx-community_X"));
    assert_eq!(state.status(), MlxServerStatus::Stopped);
    assert_eq!(mlx_endpoint(), "http://localhost:8082"); // port cleared → manual default
}

#[test]
fn status_reports_exited_with_stderr_tail_when_the_child_dies() {
    let _g = PORT_TEST_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let state = MlxServerState::default();
    state.store(running("sh", &["-c", "exit 3"], "mlx-community/Y"), 8084);
    // Give the child a moment to exit, then poll.
    std::thread::sleep(std::time::Duration::from_millis(100));
    match state.status() {
        MlxServerStatus::Exited { code, stderr_tail } => {
            assert_eq!(code, Some(3));
            assert!(stderr_tail.contains("boom"));
        }
        other => panic!("expected Exited, got {other:?}"),
    }
    let _ = state.kill_all_servers();
}
