use super::*;
use crate::commands::mlx::mlx_install::REPO_MARKER;
use std::fs;

fn write(dir: &Path, name: &str, bytes: &[u8]) {
    fs::write(dir.join(name), bytes).unwrap();
}

#[test]
fn discovers_a_dir_with_config_and_safetensors() {
    let root = tempfile::tempdir().unwrap();
    let model = root.path().join("mlx-community_Llama-4bit");
    fs::create_dir_all(&model).unwrap();
    let config = br#"{"quantization":{"bits":4,"group_size":64}}"#;
    let repo = "mlx-community/Llama-3.2-3B-Instruct-4bit";
    write(&model, "config.json", config);
    write(&model, "model.safetensors", &vec![0u8; 500]);
    write(&model, "tokenizer.json", &vec![0u8; 100]);
    write(&model, REPO_MARKER, repo.as_bytes());

    let found = discover_mlx_models(&[root.path()]);
    assert_eq!(found.len(), 1);
    let m = &found[0];
    assert_eq!(m.backend, BackendKind::Mlx);
    assert_eq!(m.name, model.to_string_lossy(), "name is the abs dir (wire id)");
    assert_eq!(m.path.as_deref(), Some(m.name.as_str()), "path == name");
    assert_eq!(m.display_name.as_deref(), Some(repo));
    assert_eq!(m.quantization, "4bit");
    // dir_size sums every file in the folder (weights + config + marker).
    assert_eq!(m.size_bytes, 500 + 100 + config.len() as u64 + repo.len() as u64);
}

#[test]
fn falls_back_to_folder_name_without_a_repo_marker() {
    let root = tempfile::tempdir().unwrap();
    let model = root.path().join("some_local_mlx");
    fs::create_dir_all(&model).unwrap();
    write(&model, "config.json", b"{}");
    write(&model, "model.safetensors", &vec![0u8; 10]);

    let found = discover_mlx_models(&[root.path()]);
    assert_eq!(found.len(), 1);
    assert_eq!(found[0].display_name.as_deref(), Some("some_local_mlx"));
    assert_eq!(found[0].quantization, "", "no quantization field → blank, not fabricated");
}

#[test]
fn skips_dirs_missing_config_or_safetensors() {
    let root = tempfile::tempdir().unwrap();
    // Only config.json, no safetensors.
    let a = root.path().join("a");
    fs::create_dir_all(&a).unwrap();
    write(&a, "config.json", b"{}");
    // Only safetensors, no config.json.
    let b = root.path().join("b");
    fs::create_dir_all(&b).unwrap();
    write(&b, "model.safetensors", &vec![0u8; 10]);

    assert!(discover_mlx_models(&[root.path()]).is_empty());
}

#[test]
fn missing_dir_is_skipped_not_an_error() {
    assert!(discover_mlx_models(&[Path::new("/__nope_zzz__")]).is_empty());
}
