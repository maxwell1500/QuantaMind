use quantamind_lib::commands::compare::{stop_compare_inner, CompareRunState};
use quantamind_lib::errors::AppError;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

fn seed_two_rows(state: &CompareRunState) -> (Uuid, CancellationToken, Uuid, CancellationToken) {
    let id1 = Uuid::new_v4();
    let id2 = Uuid::new_v4();
    let t1 = CancellationToken::new();
    let t2 = CancellationToken::new();
    let mut rows = state.rows.lock().unwrap();
    rows.insert(id1, t1.clone());
    rows.insert(id2, t2.clone());
    drop(rows);
    (id1, t1, id2, t2)
}

#[test]
fn some_cancels_only_that_row_and_removes_it_from_state() {
    let state = CompareRunState::default();
    let (id1, t1, id2, t2) = seed_two_rows(&state);
    stop_compare_inner(&state, Some(id1.to_string())).expect("ok");
    assert!(t1.is_cancelled(), "row 1's token must be cancelled");
    assert!(!t2.is_cancelled(), "row 2's token must NOT be cancelled");
    let rows = state.rows.lock().unwrap();
    assert!(!rows.contains_key(&id1), "row 1 should be removed");
    assert!(rows.contains_key(&id2), "row 2 should remain in state");
}

#[test]
fn none_cancels_run_level_token_and_drains_all_rows() {
    let state = CompareRunState::default();
    let (_id1, t1, _id2, t2) = seed_two_rows(&state);
    let run_token = CancellationToken::new();
    *state.run_cancel.lock().unwrap() = Some(run_token.clone());

    stop_compare_inner(&state, None).expect("ok");

    assert!(t1.is_cancelled());
    assert!(t2.is_cancelled());
    assert!(run_token.is_cancelled());
    assert!(state.rows.lock().unwrap().is_empty());
    assert!(state.run_cancel.lock().unwrap().is_none());
}

#[test]
fn unknown_id_is_a_no_op_not_an_error() {
    let state = CompareRunState::default();
    let stranger = Uuid::new_v4().to_string();
    stop_compare_inner(&state, Some(stranger)).expect("unknown id is silently ignored");
}

#[test]
fn malformed_uuid_returns_validation_error() {
    let state = CompareRunState::default();
    match stop_compare_inner(&state, Some("not-a-uuid".into())) {
        Err(AppError::Validation(msg)) => assert!(msg.contains("bad model_id"), "got: {msg}"),
        other => panic!("expected Validation, got {other:?}"),
    }
}
