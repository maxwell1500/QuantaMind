use mockito::{Matcher, Server};
use splice_lib::errors::AppError;
use splice_lib::inference::hf_browse::search_models;

#[tokio::test]
async fn search_returns_parsed_hits_with_query_params_set() {
    let mut s = Server::new_async().await;
    let _m = s
        .mock("GET", "/api/models")
        .match_query(Matcher::AllOf(vec![
            Matcher::UrlEncoded("search".into(), "llama".into()),
            Matcher::UrlEncoded("library".into(), "gguf".into()),
            Matcher::UrlEncoded("sort".into(), "downloads".into()),
            Matcher::UrlEncoded("direction".into(), "-1".into()),
            Matcher::UrlEncoded("limit".into(), "30".into()),
        ]))
        .with_status(200)
        .with_body(r#"[
            {"id":"bartowski/Llama-GGUF","downloads":1000,"likes":50,"tags":["gguf","llama"],"lastModified":"2024-09-25T00:00:00.000Z"},
            {"id":"other/Model-GGUF","downloads":42,"likes":3,"tags":["gguf"]}
        ]"#)
        .create_async()
        .await;
    let hits = search_models(&s.url(), "llama", 30).await.expect("ok");
    assert_eq!(hits.len(), 2);
    assert_eq!(hits[0].id, "bartowski/Llama-GGUF");
    assert_eq!(hits[0].downloads, 1000);
    assert_eq!(hits[0].likes, 50);
    assert_eq!(hits[0].tags, vec!["gguf", "llama"]);
    assert_eq!(hits[0].last_modified.as_deref(), Some("2024-09-25T00:00:00.000Z"));
    assert_eq!(hits[1].id, "other/Model-GGUF");
    assert!(hits[1].last_modified.is_none());
}

#[tokio::test]
async fn empty_query_rejected_before_network() {
    for q in ["", "   ", "\t"] {
        match search_models("http://unused", q, 30).await {
            Err(AppError::Validation(_)) => {}
            other => panic!("expected Validation for {q:?}, got {other:?}"),
        }
    }
}

#[tokio::test]
async fn limit_is_clamped_to_one_hundred() {
    let mut s = Server::new_async().await;
    let _m = s
        .mock("GET", "/api/models")
        .match_query(Matcher::UrlEncoded("limit".into(), "100".into()))
        .with_status(200)
        .with_body("[]")
        .create_async()
        .await;
    let hits = search_models(&s.url(), "x", 9999).await.expect("ok");
    assert!(hits.is_empty());
}

#[tokio::test]
async fn http_500_returns_inference_error_with_status() {
    let mut s = Server::new_async().await;
    let _m = s
        .mock("GET", "/api/models")
        .match_query(Matcher::Any)
        .with_status(500)
        .create_async()
        .await;
    match search_models(&s.url(), "x", 30).await {
        Err(AppError::Inference(msg)) => assert!(msg.contains("500"), "got: {msg}"),
        other => panic!("expected Inference, got {other:?}"),
    }
}

#[tokio::test]
async fn http_403_maps_to_auth_required() {
    let mut s = Server::new_async().await;
    let _m = s
        .mock("GET", "/api/models")
        .match_query(Matcher::Any)
        .with_status(403)
        .create_async()
        .await;
    match search_models(&s.url(), "x", 30).await {
        Err(AppError::AuthRequired(_)) => {}
        other => panic!("expected AuthRequired, got {other:?}"),
    }
}
