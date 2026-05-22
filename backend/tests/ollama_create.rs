use mockito::Server;
use splice_lib::errors::AppError;
use splice_lib::inference::ollama_create::ollama_create;

#[tokio::test]
async fn create_success_through_ndjson_progression() {
    let mut s = Server::new_async().await;
    let body = "{\"status\":\"reading model\"}\n\
                {\"status\":\"creating manifest\"}\n\
                {\"status\":\"success\"}\n";
    let _m = s.mock("POST", "/api/create")
        .with_status(200)
        .with_body(body)
        .create_async()
        .await;
    ollama_create(&s.url(), "phi-test", "FROM /tmp/x.gguf\n")
        .await
        .expect("create succeeds");
}

#[tokio::test]
async fn create_sends_correct_json_body() {
    let mut s = Server::new_async().await;
    let m = s.mock("POST", "/api/create")
        .match_body(r#"{"name":"phi-test","modelfile":"FROM /tmp/x.gguf\n"}"#)
        .with_status(200)
        .with_body("{\"status\":\"success\"}\n")
        .create_async()
        .await;
    ollama_create(&s.url(), "phi-test", "FROM /tmp/x.gguf\n").await.unwrap();
    m.assert_async().await;
}

#[tokio::test]
async fn create_http_500_returns_inference_error_with_status() {
    let mut s = Server::new_async().await;
    let _m = s.mock("POST", "/api/create").with_status(500).create_async().await;
    match ollama_create(&s.url(), "x", "FROM /tmp/x.gguf\n").await {
        Err(AppError::Inference(msg)) => assert!(msg.contains("500"), "msg: {msg}"),
        other => panic!("expected Inference, got {other:?}"),
    }
}

#[tokio::test]
async fn create_chunk_with_error_field_aborts_and_propagates_message() {
    let mut s = Server::new_async().await;
    let body = "{\"status\":\"reading model\"}\n\
                {\"error\":\"unsupported quant\"}\n";
    let _m = s.mock("POST", "/api/create")
        .with_status(200)
        .with_body(body)
        .create_async()
        .await;
    match ollama_create(&s.url(), "x", "FROM /tmp/x.gguf\n").await {
        Err(AppError::Inference(msg)) => assert!(msg.contains("unsupported quant"), "msg: {msg}"),
        other => panic!("expected Inference, got {other:?}"),
    }
}

#[tokio::test]
async fn create_stream_ending_without_success_returns_ok_anyway() {
    // Some Ollama versions end the stream after a final non-"success"
    // status. We treat clean stream end as ok; the caller can verify
    // via a subsequent list_models check if it cares.
    let mut s = Server::new_async().await;
    let body = "{\"status\":\"reading model\"}\n{\"status\":\"creating layer\"}\n";
    let _m = s.mock("POST", "/api/create")
        .with_status(200)
        .with_body(body)
        .create_async()
        .await;
    ollama_create(&s.url(), "x", "FROM /tmp/x.gguf\n").await.expect("ok on clean end");
}
