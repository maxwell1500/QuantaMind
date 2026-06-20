use super::*;
use crate::persistence::prompts::schema::InferenceParams;
use crate::persistence::publish::row::{PublishMetrics, PublishRow};

fn rows() -> Vec<PublishRow> {
    vec![PublishRow {
        model: "qwen".into(),
        quant: "Q4_K_M".into(),
        cohort_key: "apple-silicon/m3-pro/32-64gb".into(),
        tool_version: "0.2.0".into(),
        metrics: PublishMetrics { pass_k: 0.9, effort: Some(1.2), avg_steps: Some(3.0) },
        params: InferenceParams::default(),
    }]
}

#[tokio::test]
async fn happy_path_gets_one_nonce_then_posts_and_returns_board_url() {
    let mut s = mockito::Server::new_async().await;
    let nonce = s.mock("GET", "/publish/nonce").with_status(200).with_body(r#"{"nonce":"n1"}"#).expect(1).create_async().await;
    let post = s.mock("POST", "/publish").with_status(200).with_body(r#"{"board_url":"https://quantamind.co/b/1"}"#).expect(1).create_async().await;

    let out = publish_batch(&s.url(), "tok", &rows(), "deadbeef", Some("https://github.com/me/r")).await.unwrap();
    assert_eq!(out, PublishOutcome::Ok { board_url: "https://quantamind.co/b/1".into() });
    nonce.assert_async().await;
    post.assert_async().await;
}

#[tokio::test]
async fn maps_422_to_the_failing_row_index() {
    let mut s = mockito::Server::new_async().await;
    s.mock("GET", "/publish/nonce").with_status(200).with_body(r#"{"nonce":"n1"}"#).create_async().await;
    s.mock("POST", "/publish").with_status(422).with_body(r#"{"index":2}"#).create_async().await;

    let out = publish_batch(&s.url(), "tok", &rows(), "h", None).await.unwrap();
    assert_eq!(out, PublishOutcome::Invalid { index: 2 });
}

#[tokio::test]
async fn maps_429_and_426_and_401() {
    for (status, expected) in [
        (429, PublishOutcome::RateLimited),
        (426, PublishOutcome::UpdateRequired),
        (401, PublishOutcome::NeedsAuth),
    ] {
        let mut s = mockito::Server::new_async().await;
        s.mock("GET", "/publish/nonce").with_status(200).with_body(r#"{"nonce":"n1"}"#).create_async().await;
        s.mock("POST", "/publish").with_status(status).with_body("{}").create_async().await;
        assert_eq!(publish_batch(&s.url(), "tok", &rows(), "h", None).await.unwrap(), expected);
    }
}

#[tokio::test]
async fn unauthorized_nonce_short_circuits_to_needs_auth() {
    let mut s = mockito::Server::new_async().await;
    s.mock("GET", "/publish/nonce").with_status(401).with_body("no").create_async().await;
    let post = s.mock("POST", "/publish").expect(0).create_async().await;
    assert_eq!(publish_batch(&s.url(), "tok", &rows(), "h", None).await.unwrap(), PublishOutcome::NeedsAuth);
    post.assert_async().await; // never POSTed
}
