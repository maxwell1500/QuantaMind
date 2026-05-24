use mockito::Server;
use sha2::{Digest, Sha256};
use quantamind_lib::errors::AppError;
use quantamind_lib::inference::create_spec::{CreateParameters, CreateSpec};
use quantamind_lib::inference::ollama_create::ollama_create;
use std::io::Write;
use tempfile::NamedTempFile;

fn gguf_fixture(content: &[u8]) -> (NamedTempFile, String) {
    let mut f = tempfile::Builder::new().suffix(".gguf").tempfile().unwrap();
    f.write_all(content).unwrap();
    f.flush().unwrap();
    let digest = format!("{:x}", Sha256::digest(content));
    (f, digest)
}

fn spec(path: std::path::PathBuf) -> CreateSpec {
    CreateSpec { gguf_path: path, chat_template: None, parameters: CreateParameters::default() }
}

#[tokio::test]
async fn create_success_uploads_blob_then_streams_ndjson_to_success() {
    let (f, digest) = gguf_fixture(b"hello-gguf-bytes");
    let mut s = Server::new_async().await;
    let _head = s.mock("HEAD", format!("/api/blobs/sha256:{digest}").as_str())
        .with_status(404).create_async().await;
    let _blob = s.mock("POST", format!("/api/blobs/sha256:{digest}").as_str())
        .with_status(201).create_async().await;
    let _create = s.mock("POST", "/api/create")
        .with_status(200)
        .with_body("{\"status\":\"reading model\"}\n{\"status\":\"success\"}\n")
        .create_async().await;
    ollama_create(&s.url(), "qmtest:latest", &spec(f.path().to_path_buf()), |_| {})
        .await.expect("create succeeds");
}

#[tokio::test]
async fn create_skips_upload_when_blob_already_exists() {
    let (f, digest) = gguf_fixture(b"already-uploaded");
    let mut s = Server::new_async().await;
    let _head = s.mock("HEAD", format!("/api/blobs/sha256:{digest}").as_str())
        .with_status(200).create_async().await;
    let upload = s.mock("POST", format!("/api/blobs/sha256:{digest}").as_str())
        .with_status(201).expect(0).create_async().await;
    let _create = s.mock("POST", "/api/create")
        .with_status(200)
        .with_body("{\"status\":\"success\"}\n")
        .create_async().await;
    ollama_create(&s.url(), "qmtest:latest", &spec(f.path().to_path_buf()), |_| {})
        .await.expect("create succeeds without upload");
    upload.assert_async().await;
}

#[tokio::test]
async fn create_http_500_returns_inference_error() {
    let (f, digest) = gguf_fixture(b"x");
    let mut s = Server::new_async().await;
    let _h = s.mock("HEAD", format!("/api/blobs/sha256:{digest}").as_str())
        .with_status(200).create_async().await;
    let _c = s.mock("POST", "/api/create").with_status(500).create_async().await;
    match ollama_create(&s.url(), "x:latest", &spec(f.path().to_path_buf()), |_| {}).await {
        Err(AppError::Inference(msg)) => assert!(msg.contains("500"), "got: {msg}"),
        other => panic!("expected Inference, got {other:?}"),
    }
}

#[tokio::test]
async fn create_http_400_includes_ollama_response_body() {
    let (f, digest) = gguf_fixture(b"z");
    let mut s = Server::new_async().await;
    let _h = s.mock("HEAD", format!("/api/blobs/sha256:{digest}").as_str())
        .with_status(200).create_async().await;
    let _c = s.mock("POST", "/api/create")
        .with_status(400)
        .with_body(r#"{"error":"unknown field 'files'"}"#)
        .create_async().await;
    match ollama_create(&s.url(), "x:latest", &spec(f.path().to_path_buf()), |_| {}).await {
        Err(AppError::Inference(msg)) => {
            assert!(msg.contains("400"), "got: {msg}");
            assert!(msg.contains("unknown field 'files'"), "got: {msg}");
        }
        other => panic!("expected Inference, got {other:?}"),
    }
}

#[tokio::test]
async fn create_stream_without_success_marker_returns_inference_error() {
    // mmproj-only / lora-only GGUFs reproduce this: Ollama accepts the
    // upload, streams a couple of progress chunks, then closes the
    // connection without ever emitting `{"status":"success"}`. The old
    // code returned Ok here, falsely reporting success to the UI.
    let (f, digest) = gguf_fixture(b"mmproj");
    let mut s = Server::new_async().await;
    let _h = s.mock("HEAD", format!("/api/blobs/sha256:{digest}").as_str())
        .with_status(200).create_async().await;
    let _c = s.mock("POST", "/api/create")
        .with_status(200)
        .with_body("{\"status\":\"reading model\"}\n{\"status\":\"writing manifest\"}\n")
        .create_async().await;
    match ollama_create(&s.url(), "mmproj:latest", &spec(f.path().to_path_buf()), |_| {}).await {
        Err(AppError::Inference(msg)) => {
            assert!(msg.contains("stream ended without success"), "got: {msg}");
            assert!(msg.contains("writing manifest"), "should surface last status: {msg}");
        }
        other => panic!("expected Inference for silent stream end, got {other:?}"),
    }
}

#[tokio::test]
async fn create_empty_stream_returns_inference_error_with_none_status() {
    let (f, digest) = gguf_fixture(b"empty");
    let mut s = Server::new_async().await;
    let _h = s.mock("HEAD", format!("/api/blobs/sha256:{digest}").as_str())
        .with_status(200).create_async().await;
    let _c = s.mock("POST", "/api/create")
        .with_status(200).with_body("").create_async().await;
    match ollama_create(&s.url(), "x:latest", &spec(f.path().to_path_buf()), |_| {}).await {
        Err(AppError::Inference(msg)) => assert!(msg.contains("<none>"), "got: {msg}"),
        other => panic!("expected Inference, got {other:?}"),
    }
}

#[tokio::test]
async fn create_chunk_with_error_aborts_and_propagates_message() {
    let (f, digest) = gguf_fixture(b"y");
    let mut s = Server::new_async().await;
    let _h = s.mock("HEAD", format!("/api/blobs/sha256:{digest}").as_str())
        .with_status(200).create_async().await;
    let _c = s.mock("POST", "/api/create")
        .with_status(200)
        .with_body("{\"status\":\"reading\"}\n{\"error\":\"unsupported quant\"}\n")
        .create_async().await;
    match ollama_create(&s.url(), "x:latest", &spec(f.path().to_path_buf()), |_| {}).await {
        Err(AppError::Inference(msg)) => assert!(msg.contains("unsupported quant"), "got: {msg}"),
        other => panic!("expected Inference, got {other:?}"),
    }
}
