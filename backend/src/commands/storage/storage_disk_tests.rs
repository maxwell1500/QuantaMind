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

#[test]
fn gguf_dir_honors_the_override_env_var() {
    std::env::set_var("QUANTAMIND_GGUF_DIR", "/tmp/qm-gguf-test");
    assert_eq!(gguf_dir(), PathBuf::from("/tmp/qm-gguf-test"));
    std::env::remove_var("QUANTAMIND_GGUF_DIR");
}
