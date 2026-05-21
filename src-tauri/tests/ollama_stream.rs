use mockito::Server;
use splice_lib::errors::AppError;
use splice_lib::inference::ollama::stream_generate;

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
        .with_status(200)
        .with_body(body)
        .create_async()
        .await;

    let mut tokens: Vec<String> = Vec::new();
    stream_generate(&server.url(), "x", "p", |t| tokens.push(t.to_string()))
        .await
        .unwrap();

    mock.assert_async().await;
    assert_eq!(tokens.len(), 4, "expected 4 tokens, got {tokens:?}");
    assert_eq!(tokens, vec!["Hel", "lo, ", "世界", "!"]);
    assert_eq!(tokens.concat(), "Hello, 世界!");
    assert!(tokens[2].chars().count() == 2, "UTF-8 chars survived");
}

#[tokio::test]
async fn http_error_returns_inference_app_error() {
    let mut server = Server::new_async().await;
    let _mock = server
        .mock("POST", "/api/generate")
        .with_status(503)
        .create_async()
        .await;

    let result = stream_generate(&server.url(), "x", "p", |_| {}).await;
    match result {
        Err(AppError::Inference(msg)) => assert!(msg.contains("503"), "msg: {msg}"),
        other => panic!("expected Inference err, got {other:?}"),
    }
}
