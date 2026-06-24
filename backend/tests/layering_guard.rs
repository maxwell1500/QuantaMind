use std::fs;
use std::path::Path;

/// Enforces the layering law (docs/architecture.md#layering): the domain layer
/// `inference/` must not depend on the IPC layer `commands/`. If this
/// fails, a backward dependency crept back in — invert it via a sink/
/// callback trait instead of importing from `commands`.
#[test]
fn inference_does_not_import_commands() {
    let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/inference");
    let mut offenders = Vec::new();
    visit(&dir, &mut |path, body| {
        if body.contains("use crate::commands") {
            offenders.push(path.display().to_string());
        }
    });
    assert!(
        offenders.is_empty(),
        "inference/ must not import crate::commands (see docs/architecture.md#layering): {offenders:?}"
    );
}

/// Enforces the folder-taxonomy rule (docs/architecture.md#folder-taxonomy): no source
/// folder holds more than 10 .rs files. Split into concern sub-folders when
/// a folder reaches the limit.
#[test]
fn no_src_folder_exceeds_ten_rs_files() {
    let root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut offenders = Vec::new();
    check_counts(&root, &mut offenders);
    assert!(
        offenders.is_empty(),
        "folders over the 10-file limit (see docs/architecture.md#folder-taxonomy): {offenders:?}"
    );
}

fn check_counts(dir: &Path, offenders: &mut Vec<String>) {
    let mut rs_here = 0;
    for entry in fs::read_dir(dir).expect("read dir") {
        let path = entry.expect("dir entry").path();
        if path.is_dir() {
            check_counts(&path, offenders);
        } else if path.extension().is_some_and(|e| e == "rs") {
            rs_here += 1;
        }
    }
    if rs_here > 10 {
        offenders.push(format!("{} ({rs_here} files)", dir.display()));
    }
}

fn visit(dir: &Path, f: &mut impl FnMut(&Path, &str)) {
    for entry in fs::read_dir(dir).expect("read inference dir") {
        let path = entry.expect("dir entry").path();
        if path.is_dir() {
            visit(&path, f);
        } else if path.extension().is_some_and(|e| e == "rs") {
            let body = fs::read_to_string(&path).expect("read rs file");
            f(&path, &body);
        }
    }
}
