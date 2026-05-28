mod common;
use common::recording_sink;
use mockito::{Matcher, Server};
use quantamind_lib::commands::compare::CompareRunState;
use quantamind_lib::commands::compare_payloads::{
    EVENT_COMPARE_DONE, EVENT_COMPARE_ERROR, EVENT_COMPARE_RUN_DONE, EVENT_COMPARE_TOKEN,
};
use quantamind_lib::inference::compare_runner::{rows_for, run_sequential};

const OK_BODY: &str = "{\"response\":\"hi\",\"done\":false}\n{\"response\":\"\",\"done\":true}\n";

#[tokio::test]
async fn sequential_two_models_emits_token_done_per_row_then_final_run_done() {
    let mut s = Server::new_async().await;
    let _m = s.mock("POST", "/api/generate")
        .with_status(200)
        .with_body(OK_BODY)
        .expect(2)
        .create_async().await;

    let (sink, log) = recording_sink();
    let state = CompareRunState::default();
    run_sequential(sink, &state, &s.url(), rows_for(&["a".into(), "b".into()], |_| None), "ping", None, None)
        .await.expect("run_sequential ok");

    let names: Vec<String> = log.lock().unwrap().iter().map(|(n, _)| n.clone()).collect();
    let tokens = names.iter().filter(|n| n.as_str() == EVENT_COMPARE_TOKEN).count();
    let dones = names.iter().filter(|n| n.as_str() == EVENT_COMPARE_DONE).count();
    let runs = names.iter().filter(|n| n.as_str() == EVENT_COMPARE_RUN_DONE).count();
    assert!(tokens >= 2, "expected ≥2 token events, got {tokens} in {names:?}");
    assert_eq!(dones, 2, "expected 2 done events");
    assert_eq!(runs, 1, "expected 1 run_done event");
    assert_eq!(names.last().map(|s| s.as_str()), Some(EVENT_COMPARE_RUN_DONE),
        "run_done must fire last");
}

#[tokio::test]
async fn sequential_error_in_one_row_continues_to_next() {
    let mut s = Server::new_async().await;
    let _ok = s.mock("POST", "/api/generate")
        .match_body(Matcher::PartialJsonString(r#"{"model":"a"}"#.into()))
        .with_status(200).with_body(OK_BODY).create_async().await;
    let _err = s.mock("POST", "/api/generate")
        .match_body(Matcher::PartialJsonString(r#"{"model":"b"}"#.into()))
        .with_status(500).create_async().await;

    let (sink, log) = recording_sink();
    let state = CompareRunState::default();
    run_sequential(sink, &state, &s.url(), rows_for(&["a".into(), "b".into()], |_| None), "ping", None, None)
        .await.expect("run_sequential ok");

    let log = log.lock().unwrap();
    let names: Vec<&str> = log.iter().map(|(n, _)| n.as_str()).collect();
    assert!(names.iter().any(|n| *n == EVENT_COMPARE_DONE), "row a should emit done");
    assert!(names.iter().any(|n| *n == EVENT_COMPARE_ERROR), "row b should emit error");
    assert_eq!(names.last(), Some(&EVENT_COMPARE_RUN_DONE));
    let err = log.iter().find(|(n, _)| n == EVENT_COMPARE_ERROR).unwrap();
    assert_eq!(err.1["kind"], "inference");
    assert!(err.1["message"].as_str().unwrap().contains("500"));
}

#[tokio::test]
async fn token_payload_carries_model_id_and_model_name() {
    let mut s = Server::new_async().await;
    let _m = s.mock("POST", "/api/generate")
        .with_status(200).with_body(OK_BODY).create_async().await;
    let (sink, log) = recording_sink();
    let state = CompareRunState::default();
    run_sequential(sink, &state, &s.url(), rows_for(&["llama3.2:1b".into()], |_| None), "ping", None, None)
        .await.expect("ok");
    let log = log.lock().unwrap();
    let tok = log.iter().find(|(n, _)| n == EVENT_COMPARE_TOKEN).expect("token");
    assert_eq!(tok.1["model"], "llama3.2:1b");
    let id = tok.1["model_id"].as_str().expect("model_id");
    assert!(uuid::Uuid::parse_str(id).is_ok(), "model_id should be a UUID, got {id}");
}
