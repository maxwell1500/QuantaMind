use mockito::{Matcher, Server};
use quantamind_lib::commands::compare::CompareRunState;
use quantamind_lib::commands::compare_payloads::{
    EVENT_COMPARE_DONE, EVENT_COMPARE_RUN_DONE, EVENT_COMPARE_TOKEN,
};
use quantamind_lib::inference::compare_runner::{rows_for, run_parallel};
use quantamind_lib::inference::compare_runner_finalize::CompareEmit;
use std::sync::{Arc, Mutex};

type EventLog = Arc<Mutex<Vec<(String, serde_json::Value)>>>;

fn collector() -> (CompareEmit, EventLog) {
    let log: EventLog = Arc::new(Mutex::new(Vec::new()));
    let cap = log.clone();
    let emit: CompareEmit = Arc::new(move |event: &str, payload: serde_json::Value| {
        cap.lock().unwrap().push((event.to_string(), payload));
    });
    (emit, log)
}

const BODY_A: &str = "{\"response\":\"a1\",\"done\":false}\n{\"response\":\"a2\",\"done\":false}\n{\"response\":\"\",\"done\":true}\n";
const BODY_B: &str = "{\"response\":\"b1\",\"done\":false}\n{\"response\":\"b2\",\"done\":false}\n{\"response\":\"\",\"done\":true}\n";

#[tokio::test]
async fn parallel_emits_done_for_every_row_and_run_done_last() {
    let mut s = Server::new_async().await;
    let _a = s.mock("POST", "/api/generate")
        .match_body(Matcher::PartialJsonString(r#"{"model":"a"}"#.into()))
        .with_status(200).with_body(BODY_A).create_async().await;
    let _b = s.mock("POST", "/api/generate")
        .match_body(Matcher::PartialJsonString(r#"{"model":"b"}"#.into()))
        .with_status(200).with_body(BODY_B).create_async().await;

    let (emit, log) = collector();
    let state = CompareRunState::default();
    run_parallel(emit, &state, &s.url(), rows_for(&["a".into(), "b".into()], |_| None), "ping", None, None)
        .await.expect("ok");

    let names: Vec<String> = log.lock().unwrap().iter().map(|(n, _)| n.clone()).collect();
    let dones = names.iter().filter(|n| n.as_str() == EVENT_COMPARE_DONE).count();
    assert_eq!(dones, 2, "expected 2 done events, got names={names:?}");
    assert_eq!(names.last().map(|s| s.as_str()), Some(EVENT_COMPARE_RUN_DONE),
        "run_done must fire last");
}

#[tokio::test]
async fn parallel_per_row_token_order_is_monotonic_even_when_interleaved() {
    let mut s = Server::new_async().await;
    let _a = s.mock("POST", "/api/generate")
        .match_body(Matcher::PartialJsonString(r#"{"model":"a"}"#.into()))
        .with_status(200).with_body(BODY_A).create_async().await;
    let _b = s.mock("POST", "/api/generate")
        .match_body(Matcher::PartialJsonString(r#"{"model":"b"}"#.into()))
        .with_status(200).with_body(BODY_B).create_async().await;

    let (emit, log) = collector();
    let state = CompareRunState::default();
    run_parallel(emit, &state, &s.url(), rows_for(&["a".into(), "b".into()], |_| None), "ping", None, None)
        .await.expect("ok");

    let log = log.lock().unwrap();
    // Collect token texts per model in event-bus order
    let mut a_texts = Vec::new();
    let mut b_texts = Vec::new();
    for (event, payload) in log.iter() {
        if event != EVENT_COMPARE_TOKEN { continue; }
        let model = payload["model"].as_str().unwrap();
        let text = payload["text"].as_str().unwrap();
        match model {
            "a" => a_texts.push(text.to_string()),
            "b" => b_texts.push(text.to_string()),
            other => panic!("unexpected model {other}"),
        }
    }
    assert_eq!(a_texts, vec!["a1", "a2"], "row a's tokens must arrive in order");
    assert_eq!(b_texts, vec!["b1", "b2"], "row b's tokens must arrive in order");
}
