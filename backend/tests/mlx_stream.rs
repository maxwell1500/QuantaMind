use mockito::Server;
use quantamind_lib::inference::mlx::mlx::stream_generate;
use tokio_util::sync::CancellationToken;

const CHAT: &str = "/v1/chat/completions";

// mlx_lm.server streams OpenAI-compatible SSE: `data: {choices:[{delta:...}]}`,
// a terminal `finish_reason` chunk (optionally carrying `usage`), then `[DONE]`.
const SSE_BODY: &str = "data: {\"choices\":[{\"delta\":{\"content\":\"He\"}}]}\n\n\
    data: {\"choices\":[{\"delta\":{\"content\":\"llo 世\"}}]}\n\n\
    data: {\"choices\":[{\"delta\":{\"content\":\"界\"}}]}\n\n\
    data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":3,\"total_tokens\":8}}\n\n\
    data: [DONE]\n\n";

#[tokio::test]
async fn streams_ordered_utf8_tokens_and_maps_usage_counts() {
    let mut server = Server::new_async().await;
    let mock = server.mock("POST", CHAT)
        .with_status(200).with_body(SSE_BODY).create_async().await;

    let mut tokens: Vec<String> = Vec::new();
    let stats = stream_generate(&server.url(), "phi", "p", None, None,
        CancellationToken::new(), |t| tokens.push(t.to_string())).await.unwrap();

    mock.assert_async().await;
    assert_eq!(tokens.concat(), "Hello 世界");
    assert_eq!(stats.prompt_eval_count, Some(5));
    assert_eq!(stats.eval_count, Some(3));
    assert!(stats.eval_ms.is_none() && stats.total_ms.is_none());
}

// Real mlx_lm.server opens with a `: keepalive` SSE comment and sends `role`
// deltas; this version emits no `usage`. The parser must skip the comment
// (not choke on "bad chunk") and leave counts None.
#[tokio::test]
async fn skips_keepalive_comment_and_role_deltas_from_real_server() {
    let mut server = Server::new_async().await;
    let body = ": keepalive 1/1\n\n\
        data: {\"choices\":[{\"index\":0,\"finish_reason\":null,\"delta\":{\"role\":\"assistant\",\"content\":\"Hi\"}}]}\n\n\
        data: {\"choices\":[{\"index\":0,\"finish_reason\":\"stop\",\"delta\":{\"role\":\"assistant\",\"content\":\"!\"}}]}\n\n\
        data: [DONE]\n\n";
    let _mock = server.mock("POST", CHAT)
        .with_status(200).with_body(body).create_async().await;

    let mut tokens: Vec<String> = Vec::new();
    let stats = stream_generate(&server.url(), "phi", "p", None, None,
        CancellationToken::new(), |t| tokens.push(t.to_string())).await.unwrap();
    assert_eq!(tokens.concat(), "Hi!");
    assert!(stats.eval_count.is_none(), "no usage in stream -> counts stay None");
}

#[tokio::test]
async fn absent_streaming_usage_leaves_counts_none() {
    let mut server = Server::new_async().await;
    let body = "data: {\"choices\":[{\"delta\":{\"content\":\"A\"}}]}\n\n\
                data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"length\"}]}\n\n";
    let _mock = server.mock("POST", CHAT)
        .with_status(200).with_body(body).create_async().await;

    let stats = stream_generate(&server.url(), "phi", "p", None, None,
        CancellationToken::new(), |_| {}).await.unwrap();
    assert!(stats.prompt_eval_count.is_none() && stats.eval_count.is_none());
}
