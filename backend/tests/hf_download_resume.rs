use mockito::Server;
use quantamind_lib::errors::AppError;
use quantamind_lib::inference::hf_download::download_gguf;
use std::fs;
use tokio_util::sync::CancellationToken;

const P: &str = "/owner/repo/resolve/main/model.gguf";
fn body(n: usize) -> Vec<u8> { (0..n).map(|i| (i & 0xff) as u8).collect() }

#[tokio::test]
async fn partial_already_equals_total_skips_get_and_renames_to_dest() {
    let b = body(1024);
    let mut s = Server::new_async().await;
    let _h = s.mock("HEAD", P).with_status(200).with_header("content-length", "1024").create_async().await;
    let g = s.mock("GET", P).expect(0).create_async().await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("model.gguf");
    fs::write(dir.path().join("model.gguf.partial"), &b).unwrap();
    download_gguf(&s.url(), "owner/repo", "model.gguf", &dest, |_| {}, CancellationToken::new())
        .await.expect("skip rename");
    assert_eq!(fs::read(&dest).unwrap(), b);
    assert!(!dir.path().join("model.gguf.partial").exists());
    g.assert_async().await;
}

#[tokio::test]
async fn server_overrun_returns_inference_error() {
    // Server declares 100 bytes but returns 200 — must error rather
    // than silently overwrite past declared length.
    let mut s = Server::new_async().await;
    let _h = s.mock("HEAD", P).with_status(200).with_header("content-length", "100").create_async().await;
    let _g = s.mock("GET", P).with_status(200).with_body(body(200)).create_async().await;
    let dir = tempfile::tempdir().unwrap();
    match download_gguf(&s.url(), "owner/repo", "model.gguf", &dir.path().join("m.gguf"), |_| {}, CancellationToken::new()).await {
        Err(AppError::Inference(msg)) =>
            assert!(msg.contains("more bytes than Content-Length"), "msg: {msg}"),
        other => panic!("expected Inference, got {other:?}"),
    }
}

#[tokio::test]
async fn http_500_returns_inference_with_status() {
    let mut s = Server::new_async().await;
    let _h = s.mock("HEAD", P).with_status(500).create_async().await;
    let dir = tempfile::tempdir().unwrap();
    match download_gguf(&s.url(), "owner/repo", "model.gguf", &dir.path().join("m.gguf"), |_| {}, CancellationToken::new()).await {
        Err(AppError::Inference(msg)) => assert!(msg.contains("500"), "msg: {msg}"),
        other => panic!("expected Inference, got {other:?}"),
    }
}
