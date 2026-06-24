use super::*;

#[test]
fn gguf_dest_sanitizes_model_tag_into_a_filename() {
    let p = gguf_dest(Path::new("/g"), "llama3.2:1b");
    assert_eq!(p, PathBuf::from("/g/llama3.2_1b.gguf"));
}

#[test]
fn gguf_dest_replaces_slashes_from_repo_style_names() {
    let p = gguf_dest(Path::new("/g"), "meta/llama:8b");
    assert_eq!(p, PathBuf::from("/g/meta_llama_8b.gguf"));
}

// One test owns the QUANTAMIND_GGUF_DIR env var (cargo runs tests in parallel,
// so a second env-mutating test would race this one).
#[test]
fn gguf_dir_precedence_setting_then_env_then_default() {
    std::env::set_var("QUANTAMIND_GGUF_DIR", "/tmp/qm-gguf-test");
    assert_eq!(gguf_dir(), PathBuf::from("/tmp/qm-gguf-test"), "env beats default");
    assert_eq!(gguf_dir_resolved(Some("/models/shared")), PathBuf::from("/models/shared"),
        "setting beats env");
    assert_eq!(gguf_dir_resolved(Some("  ")), PathBuf::from("/tmp/qm-gguf-test"),
        "blank setting falls through to env");
    std::env::remove_var("QUANTAMIND_GGUF_DIR");
}

#[test]
fn resolved_setting_wins_without_touching_env() {
    assert_eq!(gguf_dir_resolved(Some("/models/shared")), PathBuf::from("/models/shared"));
}

#[test]
fn relative_setting_resolves_to_an_absolute_path() {
    // A relative setting (e.g. "./gguf") must never surface as a hidden path.
    let resolved = gguf_dir_resolved(Some("./gguf"));
    assert!(resolved.is_absolute(), "expected absolute, got {resolved:?}");
    assert!(resolved.ends_with("gguf"));
}

#[test]
fn mlx_model_dir_sanitizes_repo_into_a_subdir() {
    let p = mlx_model_dir(Path::new("/m"), "mlx-community/Llama-3.2-3B-Instruct-4bit");
    assert_eq!(p, PathBuf::from("/m/mlx-community_Llama-3.2-3B-Instruct-4bit"));
}

// One test owns QUANTAMIND_MLX_DIR (parallel tests would race an env mutation).
#[test]
fn mlx_dir_precedence_setting_then_env_then_default() {
    std::env::set_var("QUANTAMIND_MLX_DIR", "/tmp/qm-mlx-test");
    assert_eq!(mlx_dir(), PathBuf::from("/tmp/qm-mlx-test"), "env beats default");
    assert_eq!(mlx_dir_resolved(Some("/models/mlx")), PathBuf::from("/models/mlx"),
        "setting beats env");
    assert_eq!(mlx_dir_resolved(Some("  ")), PathBuf::from("/tmp/qm-mlx-test"),
        "blank setting falls through to env");
    std::env::remove_var("QUANTAMIND_MLX_DIR");
}

#[test]
fn mlx_dir_default_relative_setting_is_absolute() {
    let resolved = mlx_dir_resolved(Some("./mlx"));
    assert!(resolved.is_absolute(), "expected absolute, got {resolved:?}");
    assert!(resolved.ends_with("mlx"));
}
