use mockito::{Matcher, Server};
use quantamind_lib::errors::AppError;
use quantamind_lib::inference::mlx::mlx::stream_generate;
use tokio_util::sync::CancellationToken;

const CHAT: &str = "/v1/chat/completions";

#[tokio::test]
async fn http_error_returns_inference_app_error_with_body() {
    let mut server = Server::new_async().await;
    let _mock = server.mock("POST", CHAT)
        .with_status(404).with_body("model not found").create_async().await;
    match stream_generate(&server.url(), "phi", "p", None, None,
        CancellationToken::new(), |_| {}).await {
        Err(AppError::Inference(msg)) => {
            assert!(msg.contains("404") && msg.contains("model not found"), "msg: {msg}");
        }
        other => panic!("expected Inference err, got {other:?}"),
    }
}

#[tokio::test]
async fn cancellation_midstream_stops_and_returns_default_stats() {
    let mut server = Server::new_async().await;
    let body = "data: {\"choices\":[{\"delta\":{\"content\":\"A\"}}]}\n\n\
                data: {\"choices\":[{\"delta\":{\"content\":\"B\"}}]}\n\n\
                data: {\"choices\":[{\"delta\":{\"content\":\"C\"}}]}\n\n\
                data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"completion_tokens\":3}}\n\n";
    let _mock = server.mock("POST", CHAT)
        .with_status(200).with_body(body).create_async().await;

    let cancel = CancellationToken::new();
    let cancel_cb = cancel.clone();
    let mut tokens: Vec<String> = Vec::new();
    let stats = stream_generate(&server.url(), "phi", "p", None, None, cancel, |t| {
        tokens.push(t.to_string());
        if tokens.len() == 2 { cancel_cb.cancel(); }
    }).await.unwrap();
    assert_eq!(tokens, vec!["A", "B"], "no orphan tokens after cancel");
    assert!(stats.eval_count.is_none(), "cancelled run must not report counts");
}

#[tokio::test]
async fn sends_model_and_user_message_in_body() {
    let mut server = Server::new_async().await;
    let mock = server.mock("POST", CHAT)
        .match_body(Matcher::PartialJsonString(
            "{\"model\":\"phi\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}".into(),
        ))
        .with_status(200)
        .with_body("data: [DONE]\n\n")
        .create_async().await;
    stream_generate(&server.url(), "phi", "hi", None, None,
        CancellationToken::new(), |_| {}).await.unwrap();
    mock.assert_async().await;
}
