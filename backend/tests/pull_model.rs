use mockito::Server;
use quantamind_lib::errors::AppError;
use quantamind_lib::inference::pull::pull::pull_model;
use quantamind_lib::inference::pull::pull_progress::PullProgress;
use std::sync::{Arc, Mutex};
use tokio_util::sync::CancellationToken;

const FULL: &str = "{\"status\":\"pulling manifest\"}\n\
{\"status\":\"pulling sha256:abc\",\"digest\":\"sha256:abc\",\"total\":1000,\"completed\":250}\n\
{\"status\":\"pulling sha256:abc\",\"digest\":\"sha256:abc\",\"total\":1000,\"completed\":500}\n\
{\"status\":\"pulling sha256:abc\",\"digest\":\"sha256:abc\",\"total\":1000,\"completed\":1000}\n\
{\"status\":\"verifying sha256 digest\"}\n\
{\"status\":\"writing manifest\"}\n\
{\"status\":\"success\"}\n";

fn downloading_of(p: &PullProgress) -> (u64, u64, &str) {
    match p {
        PullProgress::Downloading { total, completed, digest, .. } => (*total, *completed, digest),
        _ => panic!("expected Downloading, got {p:?}"),
    }
}

#[tokio::test]
async fn full_pull_emits_events_in_order_ending_with_success() {
    let mut s = Server::new_async().await;
    let _m = s.mock("POST", "/api/pull").with_status(200).with_body(FULL).create_async().await;

    let events: Arc<Mutex<Vec<PullProgress>>> = Arc::new(Mutex::new(Vec::new()));
    let ev = events.clone();
    pull_model(&s.url(), "phi3.5:latest", move |p| ev.lock().unwrap().push(p), CancellationToken::new())
        .await
        .expect("pull should succeed");

    let got = events.lock().unwrap().clone();
    assert_eq!(got.len(), 7, "got {got:?}");
    assert_eq!(got[0], PullProgress::PullingManifest);
    assert_eq!(downloading_of(&got[1]), (1000, 250, "sha256:abc"));
    assert_eq!(downloading_of(&got[2]), (1000, 500, "sha256:abc"));
    assert_eq!(downloading_of(&got[3]), (1000, 1000, "sha256:abc"));
    assert_eq!(got[4], PullProgress::Verifying);
    assert_eq!(got[5], PullProgress::Writing);
    assert_eq!(got[6], PullProgress::Success);
}

#[tokio::test]
async fn http_500_returns_inference_error_with_status_code() {
    let mut s = Server::new_async().await;
    let _m = s.mock("POST", "/api/pull").with_status(500).create_async().await;
    match pull_model(&s.url(), "x", |_| {}, CancellationToken::new()).await {
        Err(AppError::Inference(m)) => assert!(m.contains("500"), "msg: {m}"),
        other => panic!("expected Inference, got {other:?}"),
    }
}

#[tokio::test]
async fn cancellation_after_two_events_emits_no_third() {
    let mut s = Server::new_async().await;
    let _m = s.mock("POST", "/api/pull").with_status(200).with_body(FULL).create_async().await;

    let cancel = CancellationToken::new();
    let cc = cancel.clone();
    let events: Arc<Mutex<Vec<PullProgress>>> = Arc::new(Mutex::new(Vec::new()));
    let ev = events.clone();
    pull_model(&s.url(), "x", move |p| {
        let mut e = ev.lock().unwrap();
        e.push(p);
        if e.len() == 2 { cc.cancel(); }
    }, cancel.clone())
    .await
    .expect("cancel path returns Ok");

    assert!(cancel.is_cancelled());
    let n = events.lock().unwrap().len();
    assert_eq!(n, 2, "stream stops AT the cancel trigger; got {n} events");
}
