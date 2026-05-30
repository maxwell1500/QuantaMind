use mockito::Server;
use quantamind_lib::commands::system::loaded_models::fetch_loaded;
use std::time::Duration;

const T: Duration = Duration::from_secs(5);

#[tokio::test]
async fn parses_size_and_vram_per_loaded_model() {
    let mut server = Server::new_async().await;
    let body = r#"{"models":[
        {"name":"llama3.2:3b","size":3826793472,"size_vram":3826793472,"context_length":4096},
        {"name":"phi3:mini","size":2393232384,"size_vram":1500000000}
    ]}"#;
    let mock = server.mock("GET", "/api/ps").with_status(200).with_body(body).create_async().await;

    let models = fetch_loaded(&server.url(), T).await.unwrap();
    mock.assert_async().await;

    assert_eq!(models.len(), 2);
    assert_eq!(models[0].name, "llama3.2:3b");
    assert_eq!(models[0].size_bytes, 3826793472);
    assert_eq!(models[0].size_vram_bytes, 3826793472);
    assert_eq!(models[0].context_length, Some(4096));
    // size_vram present but partial offload; context_length absent → None
    assert_eq!(models[1].size_vram_bytes, 1500000000);
    assert_eq!(models[1].context_length, None);
}

#[tokio::test]
async fn absent_size_vram_defaults_to_zero_not_error() {
    let mut server = Server::new_async().await;
    // Ollama omits size_vram when it's 0 (100% CPU).
    let body = r#"{"models":[{"name":"cpu-only:latest","size":1000}]}"#;
    let _mock = server.mock("GET", "/api/ps").with_status(200).with_body(body).create_async().await;

    let models = fetch_loaded(&server.url(), T).await.unwrap();
    assert_eq!(models[0].size_vram_bytes, 0);
    assert_eq!(models[0].size_bytes, 1000);
}

#[tokio::test]
async fn empty_models_yields_empty_vec() {
    let mut server = Server::new_async().await;
    let _mock = server.mock("GET", "/api/ps").with_status(200).with_body(r#"{"models":[]}"#).create_async().await;
    assert!(fetch_loaded(&server.url(), T).await.unwrap().is_empty());
}

#[tokio::test]
async fn unreachable_ollama_degrades_to_empty_not_error() {
    // Nothing listening on this port → connect error → graceful empty.
    let models = fetch_loaded("http://127.0.0.1:1", Duration::from_millis(300)).await.unwrap();
    assert!(models.is_empty());
}
