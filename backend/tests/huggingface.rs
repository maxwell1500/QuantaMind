use mockito::Server;
use quantamind_lib::inference::hf_download::download_gguf;
use std::fs;
use tokio_util::sync::CancellationToken;

const P: &str = "/owner/repo/resolve/main/model.gguf";
fn body(n: usize) -> Vec<u8> { (0..n).map(|i| (i & 0xff) as u8).collect() }

#[tokio::test]
async fn full_download_writes_complete_body_and_removes_partial() {
    let b = body(1024);
    let mut s = Server::new_async().await;
    let _h = s.mock("HEAD", P).with_status(200).with_header("content-length", "1024").create_async().await;
    let _g = s.mock("GET", P).with_status(200).with_body(&b).create_async().await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("model.gguf");
    let r = download_gguf(&s.url(), "owner/repo", "model.gguf", &dest, |_| {}, CancellationToken::new())
        .await.expect("download");
    assert_eq!(r.final_path, dest);
    assert_eq!(fs::read(&dest).unwrap(), b);
    assert!(!dir.path().join("model.gguf.partial").exists());
}

#[tokio::test]
async fn resume_from_partial_sends_range_header_and_yields_same_bytes() {
    let b = body(1024);
    let mut s = Server::new_async().await;
    let _h = s.mock("HEAD", P).with_status(200).with_header("content-length", "1024").create_async().await;
    let _g = s.mock("GET", P).match_header("Range", "bytes=512-").with_status(206)
        .with_body(&b[512..]).create_async().await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("model.gguf");
    fs::write(dir.path().join("model.gguf.partial"), &b[..512]).unwrap();
    download_gguf(&s.url(), "owner/repo", "model.gguf", &dest, |_| {}, CancellationToken::new())
        .await.expect("resume");
    assert_eq!(fs::read(&dest).unwrap(), b, "resume must equal fresh download byte-for-byte");
}

#[tokio::test]
async fn dest_already_exists_skips_http_entirely() {
    let mut s = Server::new_async().await;
    let h = s.mock("HEAD", P).expect(0).create_async().await;
    let g = s.mock("GET", P).expect(0).create_async().await;
    let dir = tempfile::tempdir().unwrap();
    let dest = dir.path().join("model.gguf");
    fs::write(&dest, b"prior").unwrap();
    let r = download_gguf(&s.url(), "owner/repo", "model.gguf", &dest, |_| {}, CancellationToken::new())
        .await.expect("skip");
    assert_eq!(r.final_path, dest);
    h.assert_async().await; g.assert_async().await;
}

#[tokio::test]
async fn cancel_before_download_returns_ok_with_partial_path() {
    let b = body(1024);
    let mut s = Server::new_async().await;
    let _h = s.mock("HEAD", P).with_status(200).with_header("content-length", "1024").create_async().await;
    let _g = s.mock("GET", P).with_status(200).with_body(&b).create_async().await;
    let dir = tempfile::tempdir().unwrap();
    let c = CancellationToken::new();
    c.cancel();
    let r = download_gguf(&s.url(), "owner/repo", "model.gguf", &dir.path().join("model.gguf"), |_| {}, c)
        .await.expect("cancel ok");
    assert!(r.final_path.to_string_lossy().contains(".partial"));
}
