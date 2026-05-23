use mockito::Server;
use sha2::{Digest, Sha256};
use splice_lib::inference::ollama_blob::{blob_exists, sha256_file, upload_blob};
use std::io::Write;
use std::sync::{Arc, Mutex};
use tempfile::NamedTempFile;

fn temp_with(content: &[u8]) -> (NamedTempFile, String) {
    let mut f = NamedTempFile::new().unwrap();
    f.write_all(content).unwrap();
    f.flush().unwrap();
    let digest = format!("{:x}", Sha256::digest(content));
    (f, digest)
}

#[tokio::test]
async fn sha256_file_matches_in_memory_digest_and_calls_progress() {
    let content = b"hello-blob-bytes-1234567890";
    let (f, expected) = temp_with(content);
    let progress = Arc::new(Mutex::new(Vec::<(u64, u64)>::new()));
    let p = progress.clone();
    let got = sha256_file(f.path(), move |done, total| {
        p.lock().unwrap().push((done, total));
    }).await.expect("hash succeeds");
    assert_eq!(got, expected);
    let calls = progress.lock().unwrap();
    assert!(!calls.is_empty(), "progress fired at least once");
    let (final_done, final_total) = *calls.last().unwrap();
    assert_eq!(final_done, content.len() as u64);
    assert_eq!(final_total, content.len() as u64);
}

#[tokio::test]
async fn blob_exists_returns_true_on_200() {
    let mut s = Server::new_async().await;
    let _m = s.mock("HEAD", "/api/blobs/sha256:abc123")
        .with_status(200).create_async().await;
    assert!(blob_exists(&s.url(), "abc123").await.expect("ok"));
}

#[tokio::test]
async fn blob_exists_returns_false_on_404() {
    let mut s = Server::new_async().await;
    let _m = s.mock("HEAD", "/api/blobs/sha256:missing")
        .with_status(404).create_async().await;
    assert!(!blob_exists(&s.url(), "missing").await.expect("ok"));
}

#[tokio::test]
async fn upload_blob_streams_body_and_completes_on_201() {
    let content = b"upload-me-bytes-payload";
    let (f, digest) = temp_with(content);
    let mut s = Server::new_async().await;
    let m = s.mock("POST", format!("/api/blobs/sha256:{digest}").as_str())
        .match_body(mockito::Matcher::from(content.to_vec()))
        .with_status(201).create_async().await;
    let progress = Arc::new(Mutex::new(0u64));
    let p = progress.clone();
    upload_blob(&s.url(), &digest, f.path(), move |done, _total| {
        *p.lock().unwrap() = done;
    }).await.expect("upload succeeds");
    m.assert_async().await;
    assert_eq!(*progress.lock().unwrap(), content.len() as u64);
}

#[tokio::test]
async fn upload_blob_5xx_returns_inference_error_with_status() {
    let content = b"will-fail";
    let (f, digest) = temp_with(content);
    let mut s = Server::new_async().await;
    let _m = s.mock("POST", format!("/api/blobs/sha256:{digest}").as_str())
        .with_status(503).create_async().await;
    match upload_blob(&s.url(), &digest, f.path(), |_, _| {}).await {
        Err(splice_lib::errors::AppError::Inference(msg)) =>
            assert!(msg.contains("503"), "msg: {msg}"),
        other => panic!("expected Inference, got {other:?}"),
    }
}
