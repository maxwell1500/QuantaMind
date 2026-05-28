use std::fs;
use std::path::Path;

/// Enforces the layering law (docs/layering.md): the domain layer
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
        "inference/ must not import crate::commands (see docs/layering.md): {offenders:?}"
    );
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
