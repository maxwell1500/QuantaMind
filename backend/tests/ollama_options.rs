// Step 2.1 data-quality: per-prompt inference params reach Ollama's
// /api/generate `options` block, and empty params omit it (preserving the
// v0.1 request shape).

use mockito::{Matcher, Server};
use quantamind_lib::inference::ollama::{stream_generate, GenerateOptions};
use tokio_util::sync::CancellationToken;

#[tokio::test]
async fn options_block_carries_all_params() {
    let mut server = Server::new_async().await;
    let mock = server.mock("POST", "/api/generate")
        .match_body(Matcher::PartialJsonString(
            r#"{"options":{"temperature":0.5,"top_p":0.9,"top_k":40,"num_predict":128,"repeat_penalty":1.1,"seed":7}}"#.into(),
        ))
        .with_status(200)
        .with_body("{\"response\":\"\",\"done\":true}\n")
        .create_async().await;
    let opts = GenerateOptions {
        temperature: Some(0.5), top_p: Some(0.9), top_k: Some(40),
        num_predict: Some(128), repeat_penalty: Some(1.1), seed: Some(7),
    };
    stream_generate(&server.url(), "x", "hi", None, Some(opts), None,
        CancellationToken::new(), |_| {}).await.unwrap();
    mock.assert_async().await;
}

#[tokio::test]
async fn empty_options_omits_the_options_key() {
    let mut server = Server::new_async().await;
    let mock = server.mock("POST", "/api/generate")
        .match_body(Matcher::PartialJsonString(r#"{"model":"x","prompt":"hi","stream":true}"#.into()))
        .with_status(200)
        .with_body("{\"response\":\"\",\"done\":true}\n")
        .create_async().await;
    stream_generate(&server.url(), "x", "hi", None, Some(GenerateOptions::default()), None,
        CancellationToken::new(), |_| {}).await.unwrap();
    mock.assert_async().await;
}
