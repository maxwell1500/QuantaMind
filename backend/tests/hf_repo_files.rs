use mockito::{Matcher, Server};
use quantamind_lib::errors::AppError;
use quantamind_lib::inference::hf_browse::repo_gguf_files;

#[tokio::test]
async fn returns_only_gguf_files_with_sizes() {
    let mut s = Server::new_async().await;
    let _m = s
        .mock("GET", "/api/models/bartowski/Test-GGUF/tree/main")
        .match_query(Matcher::UrlEncoded("recursive".into(), "true".into()))
        .with_status(200)
        .with_body(r#"[
            {"type":"file","path":"README.md","size":1024},
            {"type":"file","path":"Test-Q4_K_M.gguf","size":808000000},
            {"type":"file","path":"Test-Q8_0.gguf","size":1320000000},
            {"type":"directory","path":"subdir"}
        ]"#)
        .create_async()
        .await;
    let files = repo_gguf_files(&s.url(), "bartowski/Test-GGUF").await.expect("ok");
    assert_eq!(files.len(), 2);
    assert_eq!(files[0].path, "Test-Q4_K_M.gguf");
    assert_eq!(files[0].size_bytes, 808000000);
    assert_eq!(files[1].path, "Test-Q8_0.gguf");
    assert_eq!(files[1].size_bytes, 1320000000);
}

#[tokio::test]
async fn http_404_maps_to_not_found() {
    let mut s = Server::new_async().await;
    let _m = s
        .mock("GET", "/api/models/x/y/tree/main")
        .match_query(Matcher::Any)
        .with_status(404)
        .create_async()
        .await;
    match repo_gguf_files(&s.url(), "x/y").await {
        Err(AppError::NotFound(_)) => {}
        other => panic!("expected NotFound, got {other:?}"),
    }
}

#[tokio::test]
async fn invalid_repo_rejected_before_network() {
    for bad in ["", "noslash", "a/", "/b", "a/b/c"] {
        match repo_gguf_files("http://unused", bad).await {
            Err(AppError::Validation(_)) => {}
            other => panic!("expected Validation for {bad:?}, got {other:?}"),
        }
    }
}

#[tokio::test]
async fn empty_repo_returns_empty_vec() {
    let mut s = Server::new_async().await;
    let _m = s
        .mock("GET", "/api/models/empty/repo/tree/main")
        .match_query(Matcher::Any)
        .with_status(200)
        .with_body("[]")
        .create_async()
        .await;
    let files = repo_gguf_files(&s.url(), "empty/repo").await.expect("ok");
    assert!(files.is_empty());
}
