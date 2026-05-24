use mockito::{Matcher, Server};
use quantamind_lib::errors::AppError;
use quantamind_lib::inference::ollama::stream_generate;
use tokio_util::sync::CancellationToken;

#[tokio::test]
async fn streams_ordered_utf8_chunks_until_done() {
    let mut server = Server::new_async().await;
    let body = "{\"model\":\"x\",\"response\":\"Hel\",\"done\":false}\n\
                {\"model\":\"x\",\"response\":\"lo, \",\"done\":false}\n\
                {\"model\":\"x\",\"response\":\"世界\",\"done\":false}\n\
                {\"model\":\"x\",\"response\":\"!\",\"done\":false}\n\
                {\"model\":\"x\",\"response\":\"\",\"done\":true}\n";
    let mock = server
        .mock("POST", "/api/generate")
        .with_status(200).with_body(body).create_async().await;

    let mut tokens: Vec<String> = Vec::new();
    stream_generate(&server.url(), "x", "p", None, CancellationToken::new(),
        |t| tokens.push(t.to_string())).await.unwrap();

    mock.assert_async().await;
    assert_eq!(tokens, vec!["Hel", "lo, ", "世界", "!"]);
    assert_eq!(tokens.concat(), "Hello, 世界!");
}

#[tokio::test]
async fn http_error_returns_inference_app_error() {
    let mut server = Server::new_async().await;
    let _mock = server.mock("POST", "/api/generate")
        .with_status(503).create_async().await;
    let result = stream_generate(&server.url(), "x", "p", None,
        CancellationToken::new(), |_| {}).await;
    match result {
        Err(AppError::Inference(msg)) => assert!(msg.contains("503"), "msg: {msg}"),
        other => panic!("expected Inference err, got {other:?}"),
    }
}

#[tokio::test]
async fn http_400_includes_ollama_response_body() {
    let mut server = Server::new_async().await;
    let _mock = server.mock("POST", "/api/generate")
        .with_status(400)
        .with_body(r#"{"error":"model is an embedding model and does not support /api/generate"}"#)
        .create_async().await;
    let result = stream_generate(&server.url(), "snowflake-arctic-embed:l", "p",
        None, CancellationToken::new(), |_| {}).await;
    match result {
        Err(AppError::Inference(msg)) => {
            assert!(msg.contains("400"), "msg: {msg}");
            assert!(msg.contains("embedding model"), "msg should include body: {msg}");
        }
        other => panic!("expected Inference err, got {other:?}"),
    }
}

#[tokio::test]
async fn cancellation_mid_stream_stops_emission_no_orphans() {
    let mut server = Server::new_async().await;
    let body = "{\"response\":\"A\",\"done\":false}\n\
                {\"response\":\"B\",\"done\":false}\n\
                {\"response\":\"C\",\"done\":false}\n\
                {\"response\":\"\",\"done\":true}\n";
    let _mock = server.mock("POST", "/api/generate")
        .with_status(200).with_body(body).create_async().await;

    let cancel = CancellationToken::new();
    let cancel_cb = cancel.clone();
    let mut tokens: Vec<String> = Vec::new();
    stream_generate(&server.url(), "x", "p", None, cancel, |t| {
        tokens.push(t.to_string());
        if tokens.len() == 2 { cancel_cb.cancel(); }
    }).await.unwrap();
    assert_eq!(tokens, vec!["A", "B"], "no orphan tokens after cancel");
}

#[tokio::test]
async fn system_prompt_is_sent_to_ollama_when_provided() {
    let mut server = Server::new_async().await;
    let mock = server.mock("POST", "/api/generate")
        .match_body(Matcher::PartialJsonString(
            r#"{"system":"You are a terse assistant."}"#.into(),
        ))
        .with_status(200)
        .with_body("{\"response\":\"\",\"done\":true}\n")
        .create_async().await;
    stream_generate(&server.url(), "x", "hi", Some("You are a terse assistant."),
        CancellationToken::new(), |_| {}).await.unwrap();
    mock.assert_async().await;
}

#[tokio::test]
async fn system_field_is_omitted_when_no_system_prompt() {
    let mut server = Server::new_async().await;
    let mock = server.mock("POST", "/api/generate")
        .match_body(Matcher::AllOf(vec![
            Matcher::PartialJsonString(r#"{"model":"x","prompt":"hi","stream":true}"#.into()),
            // No `system` key at all
        ]))
        .with_status(200)
        .with_body("{\"response\":\"\",\"done\":true}\n")
        .create_async().await;
    stream_generate(&server.url(), "x", "hi", None,
        CancellationToken::new(), |_| {}).await.unwrap();
    mock.assert_async().await;
}
