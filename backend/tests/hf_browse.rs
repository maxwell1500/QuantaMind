use mockito::{Matcher, Server};
use quantamind_lib::errors::AppError;
use quantamind_lib::inference::hf::hf_browse::{search_models, RepoKind};

#[tokio::test]
async fn search_returns_parsed_hits_with_query_params_set() {
    let mut s = Server::new_async().await;
    let _m = s
        .mock("GET", "/api/models")
        .match_query(Matcher::AllOf(vec![
            Matcher::UrlEncoded("search".into(), "llama".into()),
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
    let hits = search_models(&s.url(), "llama", 30, RepoKind::Gguf).await.expect("ok");
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
async fn drops_results_that_do_not_carry_the_gguf_tag() {
    let mut s = Server::new_async().await;
    let _m = s.mock("GET", "/api/models")
        .match_query(Matcher::Any)
        .with_status(200)
        .with_body(r#"[
            {"id":"a/GGUF","downloads":1,"likes":0,"tags":["gguf"]},
            {"id":"b/no-gguf","downloads":1,"likes":0,"tags":["transformers"]},
            {"id":"c/GGUF","downloads":1,"likes":0,"tags":["GGUF"]}
        ]"#)
        .create_async().await;
    let hits = search_models(&s.url(), "x", 30, RepoKind::Gguf).await.expect("ok");
    let ids: Vec<&str> = hits.iter().map(|h| h.id.as_str()).collect();
    assert_eq!(ids, vec!["a/GGUF", "c/GGUF"], "non-gguf hit must be filtered");
}

#[tokio::test]
async fn mlx_kind_keeps_only_mlx_tagged_repos() {
    // With RepoKind::Mlx the filter switches to the `mlx` tag, so GGUF-only
    // repos drop out and MLX repos (mostly mlx-community) surface instead.
    let mut s = Server::new_async().await;
    let _m = s.mock("GET", "/api/models")
        .match_query(Matcher::Any)
        .with_status(200)
        .with_body(r#"[
            {"id":"mlx-community/Llama-4bit","downloads":5,"likes":1,"tags":["mlx","safetensors"]},
            {"id":"bartowski/Llama-GGUF","downloads":9,"likes":2,"tags":["gguf"]},
            {"id":"someone/Model-MLX","downloads":3,"likes":0,"tags":["MLX"]}
        ]"#)
        .create_async().await;
    let hits = search_models(&s.url(), "llama", 30, RepoKind::Mlx).await.expect("ok");
    let ids: Vec<&str> = hits.iter().map(|h| h.id.as_str()).collect();
    assert_eq!(ids, vec!["mlx-community/Llama-4bit", "someone/Model-MLX"], "gguf-only repo must drop");
}

#[tokio::test]
async fn empty_query_rejected_before_network() {
    for q in ["", "   ", "\t"] {
        match search_models("http://unused", q, 30, RepoKind::Gguf).await {
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
    let hits = search_models(&s.url(), "x", 9999, RepoKind::Gguf).await.expect("ok");
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
    match search_models(&s.url(), "x", 30, RepoKind::Gguf).await {
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
    match search_models(&s.url(), "x", 30, RepoKind::Gguf).await {
        Err(AppError::AuthRequired(_)) => {}
        other => panic!("expected AuthRequired, got {other:?}"),
    }
}
