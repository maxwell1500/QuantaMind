use super::*;
use tempfile::tempdir;

#[test]
fn state_root_errors_when_unset() {
    let s = WorkspaceState::default();
    match s.root() {
        Err(AppError::Validation(_)) => (),
        other => panic!("expected Validation, got {:?}", other),
    }
}

#[test]
fn state_ensure_within_blocks_traversal() {
    let root = tempdir().unwrap();
    let s = WorkspaceState::default();
    s.set(root.path().canonicalize().unwrap());

    let outside = tempdir().unwrap();
    let bad = outside.path().join("x.quantamind.yaml");
    match s.ensure_within(&bad) {
        Err(AppError::Validation(_)) | Err(AppError::Io(_)) => (),
        other => panic!("expected Validation/Io, got {:?}", other),
    }
}

#[test]
fn state_ensure_within_accepts_child() {
    let root = tempdir().unwrap();
    let s = WorkspaceState::default();
    s.set(root.path().canonicalize().unwrap());

    let child = root.path().join("a.quantamind.yaml");
    std::fs::write(&child, "name: x\ncreated_at: t\nupdated_at: t\n").unwrap();
    assert!(s.ensure_within(&child).is_ok());
}

#[test]
fn resolve_new_returns_canonical_target_under_root() {
    let root = tempdir().unwrap();
    let s = WorkspaceState::default();
    s.set(root.path().canonicalize().unwrap());

    let target = root.path().join("brand-new.quantamind.yaml");
    let resolved = s.resolve_new(&target).unwrap();
    assert!(resolved.starts_with(root.path().canonicalize().unwrap()));
    assert_eq!(resolved.file_name().unwrap(), "brand-new.quantamind.yaml");
}

#[test]
fn resolve_new_rejects_target_outside_root() {
    let root = tempdir().unwrap();
    let elsewhere = tempdir().unwrap();
    let s = WorkspaceState::default();
    s.set(root.path().canonicalize().unwrap());
    match s.resolve_new(&elsewhere.path().join("x.quantamind.yaml")) {
        Err(AppError::Validation(_)) => (),
        other => panic!("expected Validation, got {:?}", other),
    }
}
