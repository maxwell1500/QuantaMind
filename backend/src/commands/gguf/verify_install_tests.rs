use super::*;
use mockito::Server;
use serde_json::json;

fn tags_body(names: &[&str]) -> String {
    let models: Vec<_> = names
        .iter()
        .map(|n| {
            json!({
                "name": n, "size": 0, "modified_at": "2025-01-01T00:00:00Z",
                "details": {
                    "family": "x", "parameter_size": "1B", "quantization_level": "Q4"
                }
            })
        })
        .collect();
    json!({ "models": models }).to_string()
}

const FAST: &[u64] = &[1, 1, 1];

#[tokio::test]
async fn ok_when_model_present_immediately() {
    let mut s = Server::new_async().await;
    let _m = s
        .mock("GET", "/api/tags")
        .with_status(200)
        .with_body(tags_body(&["llama:q4"]))
        .create_async()
        .await;
    verify_with_delays(&s.url(), "llama:q4", FAST).await.unwrap();
}

#[tokio::test]
async fn ok_when_model_appears_after_initial_misses() {
    let mut s = Server::new_async().await;
    let _miss = s
        .mock("GET", "/api/tags")
        .with_status(200)
        .with_body(tags_body(&[]))
        .expect(2)
        .create_async()
        .await;
    let _hit = s
        .mock("GET", "/api/tags")
        .with_status(200)
        .with_body(tags_body(&["llama:q4"]))
        .create_async()
        .await;
    verify_with_delays(&s.url(), "llama:q4", FAST).await.unwrap();
}

#[tokio::test]
async fn err_when_model_never_appears() {
    let mut s = Server::new_async().await;
    let _m = s
        .mock("GET", "/api/tags")
        .with_status(200)
        .with_body(tags_body(&[]))
        .create_async()
        .await;
    let r = verify_with_delays(&s.url(), "nope", FAST).await;
    assert!(matches!(r, Err(AppError::Inference(_))));
}
