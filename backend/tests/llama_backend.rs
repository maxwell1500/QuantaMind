use mockito::Server;
use quantamind_lib::inference::backend::backend::InferenceBackend;
use quantamind_lib::inference::generate::generate_spec::GenerateSpec;
use quantamind_lib::inference::llama::llama_backend::LlamaCppBackend;
use tokio_util::sync::CancellationToken;

const BODY: &str = "data: {\"content\":\"Hel\",\"stop\":false}\n\n\
                    data: {\"content\":\"lo, \",\"stop\":false}\n\n\
                    data: {\"content\":\"世界\",\"stop\":false}\n\n\
                    data: {\"content\":\"!\",\"stop\":false}\n\n\
                    data: {\"content\":\"\",\"stop\":true}\n\n";

fn spec() -> GenerateSpec {
    GenerateSpec { prompt: "p".into(), ..Default::default() }
}

#[tokio::test]
async fn backend_streams_ordered_utf8_chunks_until_stop() {
    let mut server = Server::new_async().await;
    let mock = server.mock("POST", "/completion")
        .with_status(200).with_body(BODY).create_async().await;

    let mut tokens: Vec<String> = Vec::new();
    LlamaCppBackend::new(server.url())
        .generate(&spec(), CancellationToken::new(), |t| tokens.push(t.to_string()))
        .await.unwrap();

    mock.assert_async().await;
    assert_eq!(tokens, vec!["Hel", "lo, ", "世界", "!"]);
    assert_eq!(tokens.concat(), "Hello, 世界!");
}

#[tokio::test]
async fn backend_cancellation_mid_stream_stops_emission_no_orphans() {
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
    LlamaCppBackend::new(server.url())
        .generate(&spec(), cancel, |t| {
            tokens.push(t.to_string());
            if tokens.len() == 2 { cancel_cb.cancel(); }
        }).await.unwrap();
    assert_eq!(tokens, vec!["A", "B"], "no orphan tokens after cancel");
}
