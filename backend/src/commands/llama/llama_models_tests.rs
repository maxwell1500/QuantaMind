use super::*;
use std::path::PathBuf;

#[test]
fn deletable_only_for_gguf_inside_the_weights_dir() {
    let dir = PathBuf::from("/g");
    assert!(is_deletable_gguf(&dir, &PathBuf::from("/g/phi.gguf")));
    assert!(!is_deletable_gguf(&dir, &PathBuf::from("/g/notes.txt")), "non-gguf rejected");
    assert!(!is_deletable_gguf(&dir, &PathBuf::from("/etc/passwd")), "outside dir rejected");
    assert!(!is_deletable_gguf(&dir, &PathBuf::from("/other/phi.gguf")), "wrong dir rejected");
}

#[cfg(unix)]
#[test]
fn resolve_rejects_a_symlink_escaping_the_weights_dir() {
    use std::os::unix::fs::symlink;
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().join("weights");
    std::fs::create_dir(&dir).unwrap();

    // A file outside the weights folder we must not be tricked into deleting.
    let outside = tmp.path().join("secret.gguf");
    std::fs::write(&outside, b"x").unwrap();

    // A .gguf symlink *inside* the folder pointing at the outside file. The old
    // `starts_with` guard would pass (lexical prefix match); resolution refuses it.
    let link = dir.join("evil.gguf");
    symlink(&outside, &link).unwrap();

    let err = resolve_deletable_gguf(&dir, &link).unwrap_err();
    assert!(matches!(err, AppError::Validation(_)), "symlink escape must be refused");
    assert!(outside.exists(), "the outside target must be untouched");
}

#[cfg(unix)]
#[test]
fn resolve_accepts_a_real_gguf_inside_the_weights_dir() {
    let tmp = tempfile::tempdir().unwrap();
    let dir = tmp.path().join("weights");
    std::fs::create_dir(&dir).unwrap();
    let model = dir.join("phi.gguf");
    std::fs::write(&model, b"x").unwrap();

    let real = resolve_deletable_gguf(&dir, &model).unwrap();
    assert_eq!(real, model.canonicalize().unwrap());
}
