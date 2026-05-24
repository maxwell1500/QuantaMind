use quantamind_lib::commands::compare_export::save_inner;
use quantamind_lib::errors::AppError;
use tempfile::tempdir;

#[test]
fn writes_markdown_contents_byte_for_byte() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("compare.md");
    save_inner(path.to_str().unwrap(), "md", "# hello\nbody")
        .expect("write ok");
    assert_eq!(std::fs::read_to_string(&path).unwrap(), "# hello\nbody");
}

#[test]
fn writes_json_contents_byte_for_byte() {
    let dir = tempdir().unwrap();
    let path = dir.path().join("compare.json");
    let body = r#"{"k":"v"}"#;
    save_inner(path.to_str().unwrap(), "json", body).expect("write ok");
    assert_eq!(std::fs::read_to_string(&path).unwrap(), body);
}

#[test]
fn unknown_format_returns_validation() {
    match save_inner("/tmp/whatever", "xml", "x") {
        Err(AppError::Validation(msg)) => assert!(msg.contains("unknown format")),
        other => panic!("expected Validation, got {other:?}"),
    }
}

#[test]
fn empty_path_returns_validation() {
    match save_inner("", "md", "x") {
        Err(AppError::Validation(msg)) => assert!(msg.contains("path is empty")),
        other => panic!("expected Validation, got {other:?}"),
    }
}

#[test]
fn io_error_when_directory_does_not_exist() {
    let result = save_inner("/nonexistent-dir-xyz/file.md", "md", "x");
    match result {
        Err(AppError::Io(_)) => {}
        other => panic!("expected Io, got {other:?}"),
    }
}
