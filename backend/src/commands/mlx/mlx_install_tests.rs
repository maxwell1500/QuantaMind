#![allow(unused_imports)]
use super::*;

#[cfg(not(all(target_os = "macos", target_arch = "aarch64")))]
#[tokio::test]
async fn snapshot_rejected_off_apple_silicon() {
    let dir = tempfile::tempdir().unwrap();
    match fetch_mlx_snapshot("http://unused", "mlx-community/X", dir.path(), |_| {}, CancellationToken::new()).await {
        Err(AppError::Validation(msg)) => assert!(msg.contains("Apple Silicon")),
        other => panic!("expected Validation, got {other:?}"),
    }
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
#[tokio::test]
async fn snapshot_populates_model_dir_and_writes_repo_marker() {
    let body = |n: usize| (0..n).map(|i| (i & 0xff) as u8).collect::<Vec<u8>>();
    let mut s = mockito::Server::new_async().await;
    s.mock("GET", "/api/models/mlx-community/X-4bit/tree/main")
        .match_query(mockito::Matcher::Any)
        .with_status(200)
        .with_body(r#"[
            {"type":"file","path":".gitattributes","size":1},
            {"type":"file","path":"config.json","size":40},
            {"type":"file","path":"model.safetensors","size":120}
        ]"#)
        .create_async().await;
    for (p, n) in [("config.json", 40usize), ("model.safetensors", 120)] {
        let url = format!("/mlx-community/X-4bit/resolve/main/{p}");
        s.mock("HEAD", url.as_str()).with_status(200).with_header("content-length", &n.to_string()).create_async().await;
        s.mock("GET", url.as_str()).with_status(200).with_body(body(n)).create_async().await;
    }
    let dir = tempfile::tempdir().unwrap();
    let model_dir = fetch_mlx_snapshot(&s.url(), "mlx-community/X-4bit", dir.path(), |_| {}, CancellationToken::new())
        .await.expect("snapshot ok");

    assert!(model_dir.ends_with("mlx-community_X-4bit"));
    assert_eq!(fs::read(model_dir.join("config.json")).unwrap(), body(40));
    assert_eq!(fs::read(model_dir.join("model.safetensors")).unwrap(), body(120));
    // .gitattributes is junk → not downloaded.
    assert!(!model_dir.join(".gitattributes").exists());
    // Repo marker records the original id for the friendly display name.
    assert_eq!(fs::read_to_string(model_dir.join(REPO_MARKER)).unwrap(), "mlx-community/X-4bit");
}
