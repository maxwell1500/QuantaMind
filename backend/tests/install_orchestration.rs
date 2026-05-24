use quantamind_lib::commands::gguf_cmd::install_local_gguf_inner;
use quantamind_lib::errors::AppError;

#[tokio::test]
async fn install_local_gguf_nonexistent_path_rejected_before_http() {
    let r = install_local_gguf_inner(
        "http://127.0.0.1:1",
        "/definitely/does/not/exist.gguf",
        "qm-test",
        |_| {},
    ).await;
    assert!(matches!(r, Err(AppError::Validation(_))));
}

#[tokio::test]
async fn install_local_gguf_non_gguf_extension_rejected() {
    let f = tempfile::NamedTempFile::new().unwrap();
    let r = install_local_gguf_inner(
        "http://127.0.0.1:1",
        f.path().to_str().unwrap(),
        "qm-test",
        |_| {},
    ).await;
    match r {
        Err(AppError::Validation(msg)) => assert!(msg.contains(".gguf")),
        other => panic!("expected Validation, got {other:?}"),
    }
}

#[tokio::test]
async fn install_local_gguf_empty_name_rejected_before_anything_else() {
    let r = install_local_gguf_inner(
        "http://127.0.0.1:1",
        "/whatever.gguf",
        "",
        |_| {},
    ).await;
    match r {
        Err(AppError::Validation(msg)) => assert!(msg.contains("name")),
        other => panic!("expected Validation, got {other:?}"),
    }
}
