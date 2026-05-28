use mockito::Server;
use quantamind_lib::inference::backend::backend::InferenceBackend;
use quantamind_lib::inference::generate::generate_spec::GenerateSpec;
use quantamind_lib::inference::ollama::ollama::stream_generate;
use quantamind_lib::inference::ollama::ollama_backend::OllamaBackend;
use tokio_util::sync::CancellationToken;

const BODY: &str = "{\"response\":\"Hel\",\"done\":false}\n\
                    {\"response\":\"lo, \",\"done\":false}\n\
                    {\"response\":\"世界\",\"done\":false}\n\
                    {\"response\":\"!\",\"done\":false}\n\
                    {\"response\":\"\",\"done\":true}\n";

fn spec() -> GenerateSpec {
    GenerateSpec { model: "x".into(), prompt: "p".into(), ..Default::default() }
}

#[tokio::test]
async fn backend_streams_ordered_utf8_chunks_until_done() {
    let mut server = Server::new_async().await;
    let mock = server.mock("POST", "/api/generate")
        .with_status(200).with_body(BODY).create_async().await;

    let mut tokens: Vec<String> = Vec::new();
    OllamaBackend::new(server.url())
        .generate(&spec(), CancellationToken::new(), |t| tokens.push(t.to_string()))
        .await.unwrap();

    mock.assert_async().await;
    assert_eq!(tokens, vec!["Hel", "lo, ", "世界", "!"]);
    assert_eq!(tokens.concat(), "Hello, 世界!");
}

#[tokio::test]
async fn backend_cancellation_mid_stream_stops_emission_no_orphans() {
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
    OllamaBackend::new(server.url())
        .generate(&spec(), cancel, |t| {
            tokens.push(t.to_string());
            if tokens.len() == 2 { cancel_cb.cancel(); }
        }).await.unwrap();
    assert_eq!(tokens, vec!["A", "B"], "no orphan tokens after cancel");
}

#[tokio::test]
async fn backend_output_is_byte_identical_to_stream_generate() {
    let mut server = Server::new_async().await;
    let mock = server.mock("POST", "/api/generate")
        .with_status(200).with_body(BODY).expect(2).create_async().await;

    let mut via_fn: Vec<String> = Vec::new();
    stream_generate(&server.url(), "x", "p", None, None, None, CancellationToken::new(),
        |t| via_fn.push(t.to_string())).await.unwrap();

    let mut via_backend: Vec<String> = Vec::new();
    OllamaBackend::new(server.url())
        .generate(&spec(), CancellationToken::new(), |t| via_backend.push(t.to_string()))
        .await.unwrap();

    mock.assert_async().await;
    assert_eq!(via_backend, via_fn, "token sequences must match");
    assert_eq!(via_backend.concat(), via_fn.concat(), "assembled output must be byte-identical");
}
