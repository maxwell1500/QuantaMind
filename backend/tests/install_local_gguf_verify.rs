use mockito::Server;
use splice_lib::commands::gguf_cmd::verify_model_registered;
use splice_lib::errors::AppError;

const TAGS_WITH: &str = r#"{"models":[
    {"name":"tinyllama-1.1b-chat-v1.0:q8_0","size":1100000000,"modified_at":"2026-05-23T00:00:00Z","details":null},
    {"name":"llama3.2:1b","size":1300000000,"modified_at":"2026-05-22T00:00:00Z","details":null}
]}"#;
const TAGS_WITHOUT: &str = r#"{"models":[
    {"name":"llama3.2:1b","size":1300000000,"modified_at":"2026-05-22T00:00:00Z","details":null}
]}"#;

#[tokio::test]
async fn verify_passes_when_model_appears_in_tags() {
    let mut s = Server::new_async().await;
    let _m = s.mock("GET", "/api/tags").with_status(200).with_body(TAGS_WITH)
        .create_async().await;
    verify_model_registered(&s.url(), "tinyllama-1.1b-chat-v1.0:q8_0")
        .await.expect("model is present");
}

#[tokio::test]
async fn verify_fails_when_create_succeeded_but_model_missing_from_tags() {
    // Reproduces the user-reported TinyLlama symptom: install reports
    // 100% / success, but `ollama list` doesn't show the model.
    let mut s = Server::new_async().await;
    let _m = s.mock("GET", "/api/tags").with_status(200).with_body(TAGS_WITHOUT)
        .create_async().await;
    match verify_model_registered(&s.url(), "tinyllama-1.1b-chat-v1.0:q8_0").await {
        Err(AppError::Inference(msg)) => {
            assert!(msg.contains("silently rolled back"), "got: {msg}");
            assert!(msg.contains("tinyllama-1.1b-chat-v1.0:q8_0"), "should name the model: {msg}");
        }
        other => panic!("expected Inference, got {other:?}"),
    }
}

#[tokio::test]
async fn verify_propagates_inference_error_when_api_tags_itself_fails() {
    let mut s = Server::new_async().await;
    let _m = s.mock("GET", "/api/tags").with_status(503).create_async().await;
    match verify_model_registered(&s.url(), "x:latest").await {
        Err(AppError::Inference(msg)) => assert!(msg.contains("verify install"), "got: {msg}"),
        other => panic!("expected Inference, got {other:?}"),
    }
}
