use mockito::Server;
use quantamind_lib::errors::AppError;
use quantamind_lib::inference::hf::hf_download::download_gguf;
use std::fs;
use tokio_util::sync::CancellationToken;

const P: &str = "/owner/repo/resolve/main/model.gguf";
fn body(n: usize) -> Vec<u8> { (0..n).map(|i| (i & 0xff) as u8).collect() }

#[tokio::test]
async fn http_401_returns_auth_required_with_repo_in_message() {
    let mut s = Server::new_async().await;
    let _h = s.mock("HEAD", P).with_status(401).create_async().await;
    let dir = tempfile::tempdir().unwrap();
    match download_gguf(&s.url(), "owner/repo", "model.gguf", &dir.path().join("m.gguf"), |_| {}, CancellationToken::new()).await {
        Err(AppError::AuthRequired(m)) => assert!(m.contains("owner/repo"), "msg: {m}"),
        other => panic!("expected AuthRequired, got {other:?}"),
    }
}

#[tokio::test]
async fn http_404_returns_not_found() {
    let mut s = Server::new_async().await;
    let _h = s.mock("HEAD", P).with_status(404).create_async().await;
    let dir = tempfile::tempdir().unwrap();
    assert!(matches!(
        download_gguf(&s.url(), "owner/repo", "model.gguf", &dir.path().join("m.gguf"), |_| {}, CancellationToken::new()).await,
        Err(AppError::NotFound(_))
    ));
}

#[tokio::test]
async fn corrupted_partial_larger_than_total_is_deleted_and_redownloaded() {
    let b = body(1024);
    let mut s = Server::new_async().await;
    let _h = s.mock("HEAD", P).with_status(200).with_header("content-length", "1024").create_async().await;
    let _g = s.mock("GET", P).with_status(200).with_body(&b).create_async().await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("model.gguf");
    fs::write(dir.path().join("model.gguf.partial"), vec![0u8; 5000]).unwrap();
    download_gguf(&s.url(), "owner/repo", "model.gguf", &dest, |_| {}, CancellationToken::new())
        .await.expect("redownload");
    assert_eq!(fs::read(&dest).unwrap(), b);
}

#[tokio::test]
async fn invalid_repo_rejected_before_any_http() {
    let mut s = Server::new_async().await;
    let h = s.mock("HEAD", P).expect(0).create_async().await;
    let dir = tempfile::tempdir().unwrap();
    assert!(matches!(
        download_gguf(&s.url(), "no-slash", "model.gguf", &dir.path().join("m.gguf"), |_| {}, CancellationToken::new()).await,
        Err(AppError::Validation(_))
    ));
    h.assert_async().await;
}

#[tokio::test]
async fn non_gguf_filename_rejected() {
    let mut s = Server::new_async().await;
    let h = s.mock("HEAD", P).expect(0).create_async().await;
    let dir = tempfile::tempdir().unwrap();
    assert!(matches!(
        download_gguf(&s.url(), "owner/repo", "model.bin", &dir.path().join("m.bin"), |_| {}, CancellationToken::new()).await,
        Err(AppError::Validation(_))
    ));
    h.assert_async().await;
}
