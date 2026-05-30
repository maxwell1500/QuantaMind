use mockito::{Matcher, Server};
use quantamind_lib::errors::AppError;
use quantamind_lib::inference::llama::llama::stream_generate;
use tokio_util::sync::CancellationToken;

// llama-server streams /completion as SSE `data: {json}` events.
const SSE_BODY: &str = "data: {\"content\":\"Hel\",\"stop\":false}\n\n\
                        data: {\"content\":\"lo, \",\"stop\":false}\n\n\
                        data: {\"content\":\"世界\",\"stop\":false}\n\n\
                        data: {\"content\":\"!\",\"stop\":false}\n\n\
                        data: {\"content\":\"\",\"stop\":true}\n\n";

#[tokio::test]
async fn streams_ordered_utf8_chunks_until_stop() {
    let mut server = Server::new_async().await;
    let mock = server.mock("POST", "/completion")
        .with_status(200).with_body(SSE_BODY).create_async().await;

    let mut tokens: Vec<String> = Vec::new();
    stream_generate(&server.url(), "p", None, None, CancellationToken::new(),
        |t| tokens.push(t.to_string())).await.unwrap();

    mock.assert_async().await;
    assert_eq!(tokens, vec!["Hel", "lo, ", "世界", "!"]);
    assert_eq!(tokens.concat(), "Hello, 世界!");
}

#[tokio::test]
async fn accepts_bare_json_lines_without_sse_prefix() {
    let mut server = Server::new_async().await;
    let body = "{\"content\":\"A\",\"stop\":false}\n\
                {\"content\":\"B\",\"stop\":true}\n";
    let _mock = server.mock("POST", "/completion")
        .with_status(200).with_body(body).create_async().await;

    let mut tokens: Vec<String> = Vec::new();
    stream_generate(&server.url(), "p", None, None, CancellationToken::new(),
        |t| tokens.push(t.to_string())).await.unwrap();
    assert_eq!(tokens, vec!["A", "B"]);
}

#[tokio::test]
async fn http_error_returns_inference_app_error_with_body() {
    let mut server = Server::new_async().await;
    let _mock = server.mock("POST", "/completion")
        .with_status(500).with_body("model failed to load").create_async().await;
    let result = stream_generate(&server.url(), "p", None, None,
        CancellationToken::new(), |_| {}).await;
    match result {
        Err(AppError::Inference(msg)) => {
            assert!(msg.contains("500"), "msg: {msg}");
            assert!(msg.contains("model failed to load"), "msg should include body: {msg}");
        }
        other => panic!("expected Inference err, got {other:?}"),
    }
}

#[tokio::test]
async fn cancellation_mid_stream_stops_emission_no_orphans() {
    let mut server = Server::new_async().await;
    let body = "data: {\"content\":\"A\",\"stop\":false}\n\n\
                data: {\"content\":\"B\",\"stop\":false}\n\n\
                data: {\"content\":\"C\",\"stop\":false}\n\n\
                data: {\"content\":\"\",\"stop\":true}\n\n";
    let _mock = server.mock("POST", "/completion")
        .with_status(200).with_body(body).create_async().await;

    let cancel = CancellationToken::new();
    let cancel_cb = cancel.clone();
    let mut tokens: Vec<String> = Vec::new();
    stream_generate(&server.url(), "p", None, None, cancel, |t| {
        tokens.push(t.to_string());
        if tokens.len() == 2 { cancel_cb.cancel(); }
    }).await.unwrap();
    assert_eq!(tokens, vec!["A", "B"], "no orphan tokens after cancel");
}

#[tokio::test]
async fn system_prompt_is_prepended_to_prompt() {
    let mut server = Server::new_async().await;
    let mock = server.mock("POST", "/completion")
        .match_body(Matcher::PartialJsonString(
            "{\"prompt\":\"You are terse.\\n\\nhi\"}".into(),
        ))
        .with_status(200)
        .with_body("data: {\"content\":\"\",\"stop\":true}\n\n")
        .create_async().await;
    stream_generate(&server.url(), "hi", Some("You are terse."), None,
        CancellationToken::new(), |_| {}).await.unwrap();
    mock.assert_async().await;
}
