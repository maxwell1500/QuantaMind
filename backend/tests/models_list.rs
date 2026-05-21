use mockito::Server;
use splice_lib::commands::models::fetch_models;
use splice_lib::errors::AppError;

#[tokio::test]
async fn list_is_sorted_deduped_and_exact() {
    let mut server = Server::new_async().await;
    let body = r#"{
        "models": [
            {"name":"phi3:mini","modified_at":"x","size":1},
            {"name":"llama3.2:1b","modified_at":"x","size":1},
            {"name":"llama3.2:1b","modified_at":"x","size":1},
            {"name":"mistral:7b","modified_at":"x","size":1}
        ]
    }"#;
    let mock = server
        .mock("GET", "/api/tags")
        .with_status(200)
        .with_header("content-type", "application/json")
        .with_body(body)
        .create_async()
        .await;

    let names = fetch_models(&server.url()).await.unwrap();
    mock.assert_async().await;

    assert_eq!(names, vec!["llama3.2:1b", "mistral:7b", "phi3:mini"]);
    assert_eq!(names.len(), 3, "duplicates not removed");
    assert!(names.windows(2).all(|w| w[0] < w[1]), "not strictly sorted");
}

#[tokio::test]
async fn empty_models_list_yields_empty_vec() {
    let mut server = Server::new_async().await;
    let _mock = server
        .mock("GET", "/api/tags")
        .with_status(200)
        .with_body(r#"{"models":[]}"#)
        .create_async()
        .await;

    let names = fetch_models(&server.url()).await.unwrap();
    assert!(names.is_empty());
}

#[tokio::test]
async fn http_error_returns_inference_app_error() {
    let mut server = Server::new_async().await;
    let _mock = server
        .mock("GET", "/api/tags")
        .with_status(500)
        .create_async()
        .await;

    match fetch_models(&server.url()).await {
        Err(AppError::Inference(msg)) => assert!(msg.contains("500"), "msg: {msg}"),
        other => panic!("expected Inference err, got {other:?}"),
    }
}
