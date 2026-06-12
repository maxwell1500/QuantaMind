use super::*;
use tempfile::tempdir;

fn touch(p: &std::path::Path) {
    if let Some(parent) = p.parent() { std::fs::create_dir_all(parent).unwrap(); }
    std::fs::write(p, "name: x\ncreated_at: t\nupdated_at: t\n").unwrap();
}

#[test]
fn empty_dir_returns_empty_list() {
    let dir = tempdir().unwrap();
    assert_eq!(list(dir.path()).unwrap(), vec![]);
}

#[test]
fn missing_root_returns_not_found() {
    let dir = tempdir().unwrap();
    match list(&dir.path().join("nope")) {
        Err(AppError::NotFound(_)) => (),
        other => panic!("expected NotFound, got {:?}", other),
    }
}

#[test]
fn lists_files_with_matching_extension() {
    let dir = tempdir().unwrap();
    touch(&dir.path().join("a.quantamind.yaml"));
    let tree = list(dir.path()).unwrap();
    assert_eq!(tree.len(), 1);
    matches!(tree[0], TreeNode::File { .. });
}

#[test]
fn ignores_non_quantamind_files() {
    let dir = tempdir().unwrap();
    std::fs::write(dir.path().join("readme.md"), "hi").unwrap();
    std::fs::write(dir.path().join("note.txt"), "hi").unwrap();
    assert_eq!(list(dir.path()).unwrap(), vec![]);
}

#[test]
fn recurses_into_subfolders() {
    let dir = tempdir().unwrap();
    touch(&dir.path().join("drafts/k.quantamind.yaml"));
    let tree = list(dir.path()).unwrap();
    assert_eq!(tree.len(), 1);
    if let TreeNode::Folder { name, children, .. } = &tree[0] {
        assert_eq!(name, "drafts");
        assert_eq!(children.len(), 1);
    } else {
        panic!("expected Folder, got {:?}", tree[0]);
    }
}

#[test]
fn empty_subfolders_are_dropped() {
    let dir = tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("empty")).unwrap();
    assert_eq!(list(dir.path()).unwrap(), vec![]);
}

#[test]
fn hidden_quantamind_dir_is_skipped() {
    let dir = tempdir().unwrap();
    touch(&dir.path().join(".quantamind/history.yaml"));
    touch(&dir.path().join("a.quantamind.yaml"));
    let tree = list(dir.path()).unwrap();
    assert_eq!(tree.len(), 1);
}

#[test]
fn folders_sorted_before_files() {
    let dir = tempdir().unwrap();
    touch(&dir.path().join("z.quantamind.yaml"));
    touch(&dir.path().join("aaa/inside.quantamind.yaml"));
    let tree = list(dir.path()).unwrap();
    matches!(tree[0], TreeNode::Folder { .. });
    matches!(tree[1], TreeNode::File { .. });
}

#[test]
fn tree_node_serializes_with_kind_tag() {
    let n = TreeNode::File { name: "a".into(), path: "/p".into() };
    let json = serde_json::to_string(&n).unwrap();
    assert!(json.contains(r#""kind":"file""#));
}
